import { resolve } from 'node:path';
import type { LoadedConfig } from './config/defineConfig.ts';
import { matchesAny } from './config/glob.ts';
import { loadConfig } from './config/load.ts';
import { stampFor } from './config/stamp.ts';
import { mapLimit } from './fs/concurrent.ts';
import { walkFiles } from './fs/walk.ts';
import { type AtlasAnnotation, parseAtlasBlock } from './parse/parseAtlasBlock.ts';
import { type CommentStyle, styleFor } from './syntax/comments.ts';

// `inline`: the file carries its own @atlas block. `path`: the file can't hold a comment (.json,
// .txt, an image), so its tags are the ones the stamp rules give its path; it has no @uses.
export type Tagging = 'inline' | 'path';
export type FileRecord = { path: string; tagging: Tagging; annotation: AtlasAnnotation | null };
export type Analysis = { root: string; config: LoadedConfig; files: FileRecord[] };

// A file atlas considers, and the comment style it is written in (null: tagged by path).
export type ConsideredFile = { path: string; style: CommentStyle | null };

// Bound open file descriptors so a repo with thousands of files can't hit EMFILE.
const READ_CONCURRENCY = 64;

const taggedByRules = (path: string, config: LoadedConfig): boolean => {
  const s = stampFor(path, config.stamp, config.concepts);
  return s.kind.length > 0 || s.partOf.length > 0 || s.constructs.length > 0;
};

// The files atlas considers: those `include` names, or by default every file in a comment
// style atlas knows plus every file a stamp rule tags by its path.
export const consideredFiles = async (
  root: string,
  config: LoadedConfig,
): Promise<ConsideredFile[]> => {
  const { include } = config;
  const keep = include
    ? (path: string) => matchesAny(include, path)
    : (path: string) => styleFor(path, config.comments) !== null || taggedByRules(path, config);
  const paths = await walkFiles(root, config.ignore, keep);
  return paths.map((path) => ({ path, style: styleFor(path, config.comments) }));
};

// A file named like source but holding binary (a `.ts` video stream) is not read as text.
export const readText = async (root: string, path: string): Promise<string | null> => {
  const text = await Bun.file(resolve(root, path)).text();
  return text.includes('\0') ? null : text;
};

// A path-tagged file's annotation: what the rules say, or null when they say nothing.
const pathAnnotation = (path: string, config: LoadedConfig): AtlasAnnotation | null => {
  const { kind, partOf, constructs } = stampFor(path, config.stamp, config.concepts);
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
  const files = await mapLimit(considered, READ_CONCURRENCY, async ({ path, style }) => {
    if (!style) return { path, tagging: 'path' as const, annotation: pathAnnotation(path, config) };
    const text = await readText(root, path);
    if (text === null) return null;
    return { path, tagging: 'inline' as const, annotation: parseAtlasBlock(text, style) };
  });
  return { root, config, files: files.filter((f): f is FileRecord => f !== null) };
};
