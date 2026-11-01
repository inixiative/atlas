import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';
import { matchesAny } from '../config/glob.ts';

// Never considered, whatever the config says. Dotdirs are walked (`.claude/`, `.github/` carry
// real work); these aren't. `.atlas/` is the config itself.
export const ALWAYS_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.atlas/**'];

const git = async (root: string, args: string[]) => {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(['git', ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  } catch {
    throw new Error('atlas lists files with git, and git is not installed');
  }
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]);
  return { out, err: err.trim(), code };
};

// What git would commit: tracked files plus untracked ones that aren't ignored, so a new file is
// seen before it's added and generated output under .gitignore never is. Null when the root is
// not part of a repo: outside any work tree, or a folder the enclosing repo ignores (a scratch
// dir). Any other git failure (`safe.directory`, a broken index) is an error, never a silent
// switch to listing every file.
const gitFiles = async (root: string): Promise<string[] | null> => {
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0) {
    if (/not a git repository/i.test(inside.err)) return null;
    throw new Error(`git rev-parse failed in ${root}: ${inside.err}`);
  }
  if (inside.out.trim() !== 'true') return null; // inside a .git dir or a bare repo
  if ((await git(root, ['check-ignore', '-q', '.'])).code === 0) return null;
  const listed = await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (listed.code !== 0) throw new Error(`git ls-files failed in ${root}: ${listed.err}`);
  // An untracked nested repo or worktree is listed as `dir/`; it isn't a file of this repo.
  // A submodule is a gitlink, not a file, so its contents aren't walked either.
  return [...new Set(listed.out.split('\0'))].filter((p) => p !== '' && !p.endsWith('/'));
};

// A directory that isn't part of a repo (a fixture, an unpacked tarball, a fresh docs folder):
// every file in it.
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
