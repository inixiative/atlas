import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';
import { matchesAny } from '../config/glob.ts';

// Never considered, whatever the config says. Dotdirs are walked (`.claude/`, `.github/` carry
// real work); these aren't. `.atlas/` is the config itself.
export const ALWAYS_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '.atlas/**'];

// What git would commit: tracked files plus untracked ones that aren't ignored, so a new file is
// seen before it's added and generated output under .gitignore never is. Null outside a work tree.
const gitFiles = async (root: string): Promise<string[] | null> => {
  const proc = Bun.spawn(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) return null;
  // An untracked nested repo or worktree is listed as `dir/`; it isn't a file of this repo.
  return [...new Set(out.split('\0'))].filter((p) => p !== '' && !p.endsWith('/'));
};

// A directory that isn't a git work tree (a fixture, an unpacked tarball): every file in it.
const allFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  for await (const entry of new Glob('**/*').scan({ cwd: root, onlyFiles: true, dot: true }))
    files.push(entry.replaceAll('\\', '/'));
  return files;
};

const isFile = (root: string, path: string): boolean => {
  try {
    return statSync(resolve(root, path)).isFile();
  } catch {
    return false; // deleted but still in the index
  }
};

// Repo-relative files not ignored, sorted for deterministic output. `keep` decides which of the
// rest atlas considers (an include list, or the default in analyze.ts).
export const walkFiles = async (
  root: string,
  ignore: string[],
  keep: (path: string) => boolean,
): Promise<string[]> => {
  const listed = (await gitFiles(root)) ?? (await allFiles(root));
  return listed
    .filter(
      (path) =>
        !matchesAny(ALWAYS_IGNORE, path) &&
        !matchesAny(ignore, path) &&
        keep(path) &&
        isFile(root, path),
    )
    .sort();
};
