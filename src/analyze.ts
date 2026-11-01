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
  const tagsOf = (path: string) => stampFor(path, config.stamp, config.concepts);
  const keep = include
    ? (path: string) => matchesAny(include, path)
    : (path: string) => styleFor(path, config.comments) !== null || hasTags(tagsOf(path));
  const paths = await walkFiles(root, config.ignore, keep);
  return paths.map((path) => {
    const style = styleFor(path, config.comments);
    return style ? { path, style } : { path, style, stamp: tagsOf(path) };
  });
};

// A file's text, and whether it starts with a UTF-8 byte-order mark (Bun's decoder drops it, so
// the stamper puts it back; PowerShell 5.1 reads a .ps1 without one as ANSI). Null for a file
// named like source but holding binary (a `.ts` video stream).
export const readText = async (
  root: string,
  path: string,
): Promise<{ text: string; bom: boolean } | null> => {
  const bytes = await Bun.file(resolve(root, path)).bytes();
  if (bytes.includes(0)) return null;
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { text: new TextDecoder().decode(bytes), bom };
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
