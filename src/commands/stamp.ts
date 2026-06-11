import { resolve } from 'node:path';
import type { LoadedConfig } from '../config/defineConfig.ts';
import { loadConfig } from '../config/load.ts';
import { stampFor } from '../config/stamp.ts';
import { walkFiles } from '../fs/walk.ts';
import { applyStamp, type StampMode } from '../stamp/patcher.ts';

export type StampChange = { path: string; before: string; after: string };

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
  path: string,
  source: string,
  config: LoadedConfig,
  mode: StampMode,
): StampChange | null => {
  const resolved = stampFor(path, config.stamp, config.seams);
  const { content, changed } = applyStamp(source, resolved, mode);
  return changed ? { path, before: source, after: content } : null;
};

// Pure: the full change plan over an in-memory file set, scoped by target.
export const planStamp = (
  files: { path: string; source: string }[],
  config: LoadedConfig,
  mode: StampMode,
  target?: string,
): StampChange[] =>
  files
    .filter((f) => inScope(f.path, target))
    .map((f) => computeStamp(f.path, f.source, config, mode))
    .filter((c): c is StampChange => c !== null);

// IO: read the scoped files, plan, and (only with write) persist. Dry-run is
// the default everywhere — writing requires the explicit flag.
export const runStamp = async (
  root: string,
  opts: { mode: StampMode; target?: string; write: boolean },
): Promise<StampChange[]> => {
  const config = await loadConfig(root);
  const paths = (await walkFiles(root, config.include, config.ignore)).filter((p) => inScope(p, opts.target));
  const files = await Promise.all(paths.map(async (path) => ({ path, source: await Bun.file(resolve(root, path)).text() })));
  const changes = planStamp(files, config, opts.mode, opts.target);
  if (opts.write) await Promise.all(changes.map((c) => Bun.write(resolve(root, c.path), c.after)));
  return changes;
};
