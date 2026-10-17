import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { Graph } from '../commands/graph.ts';

// The harness-agnostic core of the read/grep hooks: path in, text out. Adapters
// (Claude Code today) own stdin/stdout shapes; nothing here knows about a harness.

export type AtlasLocation = { root: string; relPath: string };

// Kinds whose line also counts how many of that kind the concept holds. These are
// the files that build things for many callers, the ones agents under-weight.
export const REACH_KINDS: readonly string[] = ['factory', 'constructor'];

const SIBLING_SAMPLE = 12;
const MAX_CONCEPT_FILES = 20;
const MIN_TOKEN = 4;

// The owning `.atlas/` is the one above the file, not the session cwd: the file may
// live in a worktree while the session runs from the main checkout.
export const findAtlasRoot = (absolutePath: string): AtlasLocation | undefined => {
  const target = resolve(absolutePath);
  let dir = dirname(target);
  while (true) {
    if (existsSync(join(dir, '.atlas'))) {
      return { root: dir, relPath: relative(dir, target).split(sep).join('/') };
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

const plural = (word: string): string => {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
};

const kindLines = (
  graph: Graph,
  relPath: string,
  partOf: string[],
  kinds: readonly string[],
): string[] => {
  const own = graph.fileToConcepts[relPath]?.kind ?? [];
  const lines: string[] = [];
  for (const kind of own.filter((k) => kinds.includes(k))) {
    for (const concept of partOf) {
      const count = (graph.conceptToFiles[concept] ?? []).filter((file) =>
        graph.fileToConcepts[file]?.kind.includes(kind),
      ).length;
      lines.push(`${kind}, 1 of ${count} ${plural(kind)} in ${concept}`);
    }
  }
  return lines;
};

// The read-side neighbourhood: which concepts the file is part of, how many
// siblings and @uses consumers each has, and the file's own load-bearing @uses.
export const renderNeighbourhood = (
  graph: Graph,
  relPath: string,
  options: { kinds?: readonly string[] } = {},
): string | undefined => {
  const membership = graph.fileToConcepts[relPath];
  if (!membership) return undefined;
  const partOfBlocks = membership.partOf.map((concept) => {
    const siblings = (graph.conceptToFiles[concept] ?? []).filter((file) => file !== relPath);
    const sample = siblings.slice(0, SIBLING_SAMPLE).map((file) => `  ${file}`);
    const more =
      siblings.length > SIBLING_SAMPLE ? [`  … ${siblings.length - SIBLING_SAMPLE} more`] : [];
    const consumers = graph.usesConsumers[concept]?.length ?? 0;
    return [
      `${concept} — ${siblings.length} other file(s)${consumers > 0 ? `, ${consumers} consumer(s) via @uses` : ''}; \`bunx atlas query --partOf ${concept}\` lists all`,
      ...sample,
      ...more,
    ].join('\n');
  });
  const usesBlock =
    membership.uses.length > 0
      ? [
          `@uses ${membership.uses.join(', ')} — load-bearing dependencies; \`bunx atlas query --partOf <concept>\` shows what implements each`,
        ]
      : [];
  const kinds = kindLines(graph, relPath, membership.partOf, options.kinds ?? REACH_KINDS);
  const kindBlock = kinds.length > 0 ? [kinds.join('\n')] : [];
  const blocks = [...kindBlock, ...partOfBlocks, ...usesBlock];
  if (partOfBlocks.length === 0 && usesBlock.length === 0) return undefined;
  return `atlas neighbourhood of ${relPath}:\n\n${blocks.join('\n\n')}`;
};

// A grep pattern is a regex, not a symbol; only its longest identifier-shaped run
// is worth looking up.
export const identifierToken = (pattern: string): string | undefined => {
  const tokens = pattern.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const longest = tokens.sort((a, b) => b.length - a.length)[0];
  return longest && longest.length >= MIN_TOKEN ? longest : undefined;
};

// The grep-side lookup: concepts whose name the pattern's identifier names (exactly,
// or as a prefix either way once both are long enough to mean something).
export const renderConceptMatches = (graph: Graph, pattern: string): string | undefined => {
  const token = identifierToken(pattern);
  if (!token) return undefined;
  const lower = token.toLowerCase();
  const hits = Object.keys(graph.conceptToFiles)
    .sort()
    .filter((concept) => {
      const name = concept.split(':')[1]?.toLowerCase() ?? '';
      return (
        name === lower ||
        (name.length >= 5 && lower.startsWith(name)) ||
        (lower.length >= 5 && name.startsWith(lower))
      );
    });
  if (hits.length === 0) return undefined;
  const blocks = hits.map((concept) => {
    const files = graph.conceptToFiles[concept] ?? [];
    const sample = files.slice(0, MAX_CONCEPT_FILES).map((file) => `  ${file}`);
    const more =
      files.length > MAX_CONCEPT_FILES ? [`  … ${files.length - MAX_CONCEPT_FILES} more`] : [];
    const consumers = graph.usesConsumers[concept]?.length ?? 0;
    return [
      `${concept} — ${files.length} file(s)${consumers > 0 ? `, ${consumers} consumer(s) via @uses` : ''}; \`bunx atlas query --partOf ${concept}\` lists all`,
      ...sample,
      ...more,
    ].join('\n');
  });
  return `atlas concept(s) matching "${token}":\n\n${blocks.join('\n\n')}`;
};
