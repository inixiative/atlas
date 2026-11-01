import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { walkFiles } from '../fs/walk.ts';
import { type CommentStyleName, entryFor } from '../syntax/comments.ts';

// `atlas init` writes a starter `.atlas/`: config.ts with an include list for the languages the
// repo has, kinds.ts from the example, and concepts.ts with the example's guidance and no
// concepts. Proposing the concept registry is a person's (or Foundry setup's agent's) job.

const EXAMPLE = resolve(import.meta.dir, '../../examples/atlas-config');

export type Language = { entry: string; style: CommentStyleName; files: number };
export type InitReport = { dir: string; languages: Language[]; written: string[] };

// The table entries (`.py`, `Dockerfile`) the repo's files use, most files first, spelled as the
// files spell them: matching ignores case but the include globs don't, so `analysis.R` must
// yield `**/*.R`, not the table's `.r`.
export const detectLanguages = async (root: string): Promise<Language[]> => {
  const counts = new Map<string, Language>();
  for (const path of await walkFiles(root, [], () => true)) {
    const match = entryFor(path);
    if (!match) continue;
    const name = path.slice(path.lastIndexOf('/') + 1);
    const entry = match.entry.startsWith('.') ? name.slice(-match.entry.length) : name;
    const seen = counts.get(entry) ?? { entry, style: match.style, files: 0 };
    seen.files += 1;
    counts.set(entry, seen);
  }
  return [...counts.values()].sort((a, b) => b.files - a.files || a.entry.localeCompare(b.entry));
};

const globFor = (entry: string): string => (entry.startsWith('.') ? `**/*${entry}` : `**/${entry}`);

const configSource = (languages: Language[]): string => {
  const include = languages
    .map((l) => `    '${globFor(l.entry)}', // ${l.files} file(s), ${l.style} comments`)
    .join('\n');
  return `import { defineConfig } from '@inixiative/atlas/config';

// Written by \`atlas init\` from the languages in this repo. Narrow \`include\` to what you want
// mapped, list tests and generated files under \`ignore\`, and add stamp rules (path → @kind,
// @partOf) as in @inixiative/atlas examples/atlas-config/config.ts. A file with no comment style
// (.json, .txt) is tagged by the stamp rules that match its path; add its glob to \`include\`.
export default defineConfig({
  include: [
${include}
  ],
  ignore: [],
  stamp: [],
});
`;
};

// The example's guidance, with an empty registry.
const conceptsSource = async (): Promise<string> => {
  const example = await Bun.file(join(EXAMPLE, 'concepts.ts')).text();
  const head = example.slice(0, example.indexOf('export const CONCEPTS'));
  return `${head}// Starter written by \`atlas init\`: no concepts yet.\nexport const CONCEPTS: ConceptRegistry = {};\n`;
};

export const init = async (root: string): Promise<InitReport> => {
  const dir = join(root, '.atlas');
  if (existsSync(dir)) throw new Error(`${dir} already exists; atlas init only starts a new one`);
  const languages = await detectLanguages(root);
  if (languages.length === 0)
    throw new Error(
      'no files in a comment style atlas knows; write .atlas/config.ts by hand and add your file types under `comments`',
    );

  const files: Record<string, string> = {
    'config.ts': configSource(languages),
    'kinds.ts': await Bun.file(join(EXAMPLE, 'kinds.ts')).text(),
    'concepts.ts': await conceptsSource(),
  };
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text, 'utf8');
  return { dir: '.atlas', languages, written: Object.keys(files).map((n) => `.atlas/${n}`) };
};
