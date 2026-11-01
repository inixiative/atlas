import { resolve } from 'node:path';
import type { LoadedConfig } from './config/defineConfig.ts';
import { matchesAny } from './config/glob.ts';
import { loadConfig } from './config/load.ts';
import { type ResolvedStamp, stampFor } from './config/stamp.ts';
import { mapLimit } from './fs/concurrent.ts';
import { walkFiles } from './fs/walk.ts';
import { type AtlasAnnotation, parseAtlasBlock } from './parse/parseAtlasBlock.ts';
import { type CommentStyle, styleFor } from './syntax/comments.ts';

// `inline`: the file carries its own @atlas block. `path`: the file can't hold a comment (.json,
// .txt, an image), so its tags are the ones the stamp rules give its path; it has no @uses.
export type Tagging = 'inline' | 'path';
export type FileRecord = { path: string; tagging: Tagging; annotation: AtlasAnnotation | null };
export type Analysis = { root: string; config: LoadedConfig; files: FileRecord[] };

// A file atlas considers, and the comment style it is written in (null: tagged by path, with
// what its rules give it).
export type ConsideredFile =
  | { path: string; style: CommentStyle }
  | { path: string; style: null; stamp: ResolvedStamp };

// Bound open file descriptors so a repo with thousands of files can't hit EMFILE.
const READ_CONCURRENCY = 64;

const hasTags = (s: ResolvedStamp): boolean =>
  s.kind.length > 0 || s.partOf.length > 0 || s.constructs.length > 0;

// The files atlas considers: those `include` names, or by default every file in a comment
// style atlas knows plus every file a stamp rule tags by its path. A path-tagged file carries
// the rules' result, so it is resolved once.
export const consideredFiles = async (
  root: string,
  config: LoadedConfig,
): Promise<ConsideredFile[]> => {
  const { include } = config;
  const resolved = new Map<string, ResolvedStamp>();
  const tagsOf = (path: string): ResolvedStamp => {
    let stamp = resolved.get(path);
    if (!stamp) {
      stamp = stampFor(path, config.stamp, config.concepts);
      resolved.set(path, stamp);
    }
    return stamp;
  };
  const keep = include
    ? (path: string) => matchesAny(include, path)
    : (path: string) => styleFor(path, config.comments) !== null || hasTags(tagsOf(path));
  const paths = await walkFiles(root, config.ignore, keep);
  return paths.map((path) => {
    const style = styleFor(path, config.comments);
    return style ? { path, style } : { path, style, stamp: tagsOf(path) };
  });
};

// How a file's text is stored, so the stamper writes it back the same way. Bun's decoder drops
// a byte-order mark, and Windows tools depend on it: PowerShell 5.1 reads a .ps1 without one as
// ANSI, and writes UTF-16 by default.
export type TextEncoding = 'utf-8' | 'utf-8-bom' | 'utf-16le' | 'utf-16be';

const BOMS: Record<Exclude<TextEncoding, 'utf-8'>, number[]> = {
  'utf-8-bom': [0xef, 0xbb, 0xbf],
  'utf-16le': [0xff, 0xfe],
  'utf-16be': [0xfe, 0xff],
};

const startsWith = (bytes: Uint8Array, prefix: number[]): boolean =>
  prefix.every((byte, i) => bytes[i] === byte);

// A file's text and encoding, or null for a file named like source but holding binary (a `.ts`
// video stream: NUL bytes and not valid UTF-8) or stored as UTF-32. A NUL alone isn't binary:
// valid UTF-8 source may hold one. `exact` is false when the bytes aren't valid in their
// encoding (a Windows-1252 `.ps1`): the text is still read, with U+FFFD for the bad bytes, so
// check and graph work, but the stamper must not write it back.
export const readText = async (
  root: string,
  path: string,
): Promise<{ text: string; encoding: TextEncoding; exact: boolean } | null> => {
  const bytes = await Bun.file(resolve(root, path)).bytes();
  if (startsWith(bytes, [0xff, 0xfe, 0, 0]) || startsWith(bytes, [0, 0, 0xfe, 0xff])) return null;
  let encoding: TextEncoding = startsWith(bytes, BOMS['utf-8-bom']) ? 'utf-8-bom' : 'utf-8';
  for (const utf16 of ['utf-16le', 'utf-16be'] as const)
    if (startsWith(bytes, BOMS[utf16])) encoding = utf16;
  const label = encoding === 'utf-8-bom' ? 'utf-8' : encoding;
  try {
    return { text: new TextDecoder(label, { fatal: true }).decode(bytes), encoding, exact: true };
  } catch {
    if (label === 'utf-8' && bytes.includes(0)) return null;
    return { text: new TextDecoder(label).decode(bytes), encoding, exact: false };
  }
};

// The bytes to write for `text` in `encoding`, byte-order mark included.
export const encodeText = (text: string, encoding: TextEncoding): Uint8Array => {
  if (encoding === 'utf-8') return new TextEncoder().encode(text);
  if (encoding === 'utf-8-bom')
    return new Uint8Array([...BOMS[encoding], ...new TextEncoder().encode(text)]);
  const out = new Uint8Array(2 + text.length * 2);
  out.set(BOMS[encoding]);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    const [first, second] =
      encoding === 'utf-16le' ? [unit & 0xff, unit >> 8] : [unit >> 8, unit & 0xff];
    out[2 + i * 2] = first;
    out[3 + i * 2] = second;
  }
  return out;
};

// A path-tagged file's annotation: what the rules say, or null when they say nothing.
const pathAnnotation = ({ kind, partOf, constructs }: ResolvedStamp): AtlasAnnotation | null => {
  if (kind.length + partOf.length + constructs.length === 0) return null;
  const axes: Record<string, string[]> = { kind, partOf };
  if (constructs.length) axes.constructs = constructs;
  return { kind, partOf, constructs, uses: [], usesState: 'absent', pinned: false, axes };
};

// One pass: load the consumer's .atlas/ config, walk the considered files, and
// parse each into its @atlas annotation (or null). Every command consumes this.
export const analyze = async (root: string): Promise<Analysis> => {
  const config = await loadConfig(root);
  const considered = await consideredFiles(root, config);
  const files = await mapLimit(considered, READ_CONCURRENCY, async (file) => {
    const { path } = file;
    if (file.style === null)
      return { path, tagging: 'path' as const, annotation: pathAnnotation(file.stamp) };
    const read = await readText(root, path);
    if (read === null) return null;
    return { path, tagging: 'inline' as const, annotation: parseAtlasBlock(read.text, file.style) };
  });
  return { root, config, files: files.filter((f): f is FileRecord => f !== null) };
};
