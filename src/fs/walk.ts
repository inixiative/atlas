import { Glob } from 'bun';
import { matchesAny } from '../config/glob.ts';

export const DEFAULT_INCLUDE = ['**/*.ts', '**/*.tsx'];

// Never walk into these regardless of consumer config.
const ALWAYS_IGNORE = ['**/node_modules/**', '**/.git/**', '**/dist/**'];

// Repo-relative source files matching `include` and not `ignore`, sorted for
// deterministic output. Dotfiles/dotdirs (including `.atlas/`) are skipped.
export const walkFiles = async (
  root: string,
  include: string[] = DEFAULT_INCLUDE,
  ignore: string[] = [],
): Promise<string[]> => {
  const glob = new Glob('**/*');
  const files: string[] = [];
  for await (const entry of glob.scan({ cwd: root, onlyFiles: true, dot: false })) {
    const path = entry.replaceAll('\\', '/');
    if (matchesAny(ALWAYS_IGNORE, path)) continue;
    if (!matchesAny(include, path)) continue;
    if (matchesAny(ignore, path)) continue;
    files.push(path);
  }
  return files.sort();
};
