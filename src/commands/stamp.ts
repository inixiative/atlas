import { resolve } from 'node:path';
import { consideredFiles, readText } from '../analyze.ts';
import type { LoadedConfig } from '../config/defineConfig.ts';
import { loadConfig } from '../config/load.ts';
import { stampFor } from '../config/stamp.ts';
import { mapLimit } from '../fs/concurrent.ts';
import { applyStamp, type StampMode, type StampSkip } from '../stamp/patcher.ts';
import type { CommentStyle } from '../syntax/comments.ts';

export type StampChange = { path: string; before: string; after: string };
export type Unresolved = { file: string; category: string; value: string };
export type Skipped = { file: string; reason: StampSkip };
export type StampResult = { changes: StampChange[]; unresolved: Unresolved[]; skipped: Skipped[] };

const IO_CONCURRENCY = 64;

// A file is in scope when no target is given, when the target IS the file, or
// when the target is a folder the file lives under. (all / folder / individual)
export const inScope = (path: string, target?: string): boolean => {
  if (!target) return true;
  if (path === target) return true;
  const folder = target.endsWith('/') ? target : `${target}/`;
  return path.startsWith(folder);
};

// Pure: what stamping a file WOULD do, or null if it's already up to date.
export const computeStamp = (
  file: { path: string; style: CommentStyle },
  source: string,
  config: LoadedConfig,
  mode: StampMode,
): StampChange | null => {
  const { path } = file;
  const resolved = stampFor(path, config.stamp, config.concepts);
  const { content, changed } = applyStamp(source, resolved, file, mode);
  return changed ? { path, before: source, after: content } : null;
};

// Pure: the full change plan over an in-memory file set, scoped by target.
export const planStamp = (
  files: { path: string; style: CommentStyle; source: string }[],
  config: LoadedConfig,
  mode: StampMode,
  target?: string,
): StampChange[] =>
  files
    .filter((f) => inScope(f.path, target))
    .map((f) => computeStamp(f, f.source, config, mode))
    .filter((c): c is StampChange => c !== null);

// IO: read the scoped files, plan, and (only with write) persist. Dry-run is
// the default everywhere — writing requires the explicit flag. Reads/writes are
// concurrency-bounded so a large repo can't exhaust file descriptors. Unresolved
// memberships are surfaced here (not just in `coverage`) so a capture that maps
// to no concept — leaving a file under-stamped — is visible at write time.
export const runStamp = async (
  root: string,
  opts: { mode: StampMode; target?: string; write: boolean },
): Promise<StampResult> => {
  const config = await loadConfig(root);
  const scoped = (await consideredFiles(root, config)).filter((f) => inScope(f.path, opts.target));
  // A file with no comment style is tagged by its path; there is nothing to write into it.
  const read = await mapLimit(scoped, IO_CONCURRENCY, async ({ path, style }) => {
    if (!style) return null;
    const source = await readText(root, path);
    return source === null ? null : { path, style, source };
  });
  const files = read.filter((f) => f !== null);

  const changes: StampChange[] = [];
  const skipped: Skipped[] = [];
  for (const file of files) {
    const resolved = stampFor(file.path, config.stamp, config.concepts);
    const result = applyStamp(file.source, resolved, file, opts.mode);
    if (result.changed)
      changes.push({ path: file.path, before: file.source, after: result.content });
    else if (result.skipped) skipped.push({ file: file.path, reason: result.skipped });
  }
  const unresolved: Unresolved[] = [];
  for (const { path } of scoped) {
    for (const u of stampFor(path, config.stamp, config.concepts).unresolved) {
      unresolved.push({ file: path, category: u.category, value: u.value });
    }
  }

  if (opts.write)
    await mapLimit(changes, IO_CONCURRENCY, (c) => Bun.write(resolve(root, c.path), c.after));
  return { changes, unresolved, skipped };
};
