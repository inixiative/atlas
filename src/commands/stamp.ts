import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { consideredFiles, encodeText, readText, type TextEncoding } from '../analyze.ts';
import type { LoadedConfig } from '../config/defineConfig.ts';
import { loadConfig } from '../config/load.ts';
import { stampFor } from '../config/stamp.ts';
import { mapLimit } from '../fs/concurrent.ts';
import { applyStamp, type StampMode, type StampSkip } from '../stamp/patcher.ts';
import type { CommentStyle } from '../syntax/comments.ts';

// `before`/`after` are the text; `encoding` is how the file stores it (written back the same way).
export type StampChange = { path: string; before: string; after: string; encoding?: TextEncoding };
export type Unresolved = { file: string; category: string; value: string };
export type Skipped = { file: string; reason: StampSkip };
export type StampResult = { changes: StampChange[]; unresolved: Unresolved[]; skipped: Skipped[] };

const IO_CONCURRENCY = 64;

// A file is in scope when no target is given, when a target IS the file, or when a target is a
// folder the file lives under. Targets are repo-relative and may be written `./src`, `src/` or
// `.` (the whole repo), as a shell or `dirname` produces them.
export const inScope = (path: string, targets: string[] = []): boolean => {
  if (targets.length === 0) return true;
  return targets.some((raw) => {
    const target = raw.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
    if (target === '' || target === '.') return true;
    return path === target || path.startsWith(`${target}/`);
  });
};

// Command-line targets as repo-relative paths. A target is resolved against the repo root (an
// absolute path works too) and must exist inside it: a typo'd or outside path would otherwise
// scope a check to nothing and pass.
export const resolveTargets = (root: string, raw: string[]): string[] =>
  raw.map((target) => {
    const absolute = resolve(root, target);
    const rel = relative(resolve(root), absolute).replaceAll('\\', '/');
    if (rel.startsWith('..') || isAbsolute(rel))
      throw new Error(`target is outside the repo root: ${target}`);
    if (!existsSync(absolute)) throw new Error(`no such file or folder: ${target}`);
    return rel === '' ? '.' : rel;
  });

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
  targets: string[] = [],
): StampChange[] =>
  files
    .filter((f) => inScope(f.path, targets))
    .map((f) => computeStamp(f, f.source, config, mode))
    .filter((c): c is StampChange => c !== null);

// IO: read the scoped files, plan, and (only with write) persist. Dry-run is
// the default everywhere — writing requires the explicit flag. Reads/writes are
// concurrency-bounded so a large repo can't exhaust file descriptors. Unresolved
// memberships are surfaced here (not just in `coverage`) so a capture that maps
// to no concept — leaving a file under-stamped — is visible at write time.
export const runStamp = async (
  root: string,
  opts: { mode: StampMode; targets?: string[]; write: boolean },
): Promise<StampResult> => {
  const config = await loadConfig(root);
  const scoped = (await consideredFiles(root, config)).filter((f) => inScope(f.path, opts.targets));
  // A file with no comment style is tagged by its path; there is nothing to write into it.
  const read = await mapLimit(scoped, IO_CONCURRENCY, async ({ path, style }) => {
    if (!style) return null;
    const read = await readText(root, path);
    return read === null
      ? null
      : { path, style, source: read.text, encoding: read.encoding, exact: read.exact };
  });
  const files = read.filter((f) => f !== null);

  const changes: StampChange[] = [];
  const skipped: Skipped[] = [];
  // the rules' result for each file, used for the stamp and for the unresolved report
  const rules = new Map(
    scoped.map(
      (f) =>
        [
          f.path,
          f.style === null ? f.stamp : stampFor(f.path, config.stamp, config.concepts),
        ] as const,
    ),
  );
  for (const file of files) {
    const resolved = rules.get(file.path) ?? stampFor(file.path, config.stamp, config.concepts);
    const result = applyStamp(file.source, resolved, file, opts.mode);
    if (result.changed && !file.exact) skipped.push({ file: file.path, reason: 'encoding' });
    else if (result.changed)
      changes.push({
        path: file.path,
        before: file.source,
        after: result.content,
        encoding: file.encoding,
      });
    else if (result.skipped) skipped.push({ file: file.path, reason: result.skipped });
  }
  const unresolved: Unresolved[] = [];
  for (const [path, stamp] of rules) {
    for (const u of stamp.unresolved) {
      unresolved.push({ file: path, category: u.category, value: u.value });
    }
  }

  if (opts.write)
    await mapLimit(changes, IO_CONCURRENCY, (c) =>
      Bun.write(resolve(root, c.path), encodeText(c.after, c.encoding ?? 'utf-8')),
    );
  return { changes, unresolved, skipped };
};
