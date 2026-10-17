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

// Words a phrase carries no meaning in: "seed a user" and `seedUser` are the same search.
const FILLER = new Set(['a', 'an', 'the', 'to', 'of', 'for']);

// The lowercase words of a phrase or identifier: camelCase and regex escapes (`\b`, `\w`)
// split, punctuation and regex syntax dropped. Filler words go unless they are all there is.
const wordsOf = (text: string): string[] => {
  const words = (
    text
      .replace(/\\[A-Za-z]/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).map((word) => word.toLowerCase());
  const meaningful = words.filter((word) => !FILLER.has(word));
  return meaningful.length > 0 ? meaningful : words;
};

// Does a run of consecutive pattern words spell the phrase? Compared joined, so the split
// doesn't matter: `seedUser` spells "seed a user", `createGitHubClient` spells "github",
// `github` spells "GitHub". Runs start and end on word boundaries, so `unlock` never spells "lock".
const spells = (patternWords: string[], phrase: string): boolean => {
  const target = wordsOf(phrase).join('');
  if (target === '') return false;
  return patternWords.some((_, start) => {
    let joined = '';
    for (let i = start; i < patternWords.length && joined.length < target.length; i++) {
      joined += patternWords[i];
      if (joined === target) return true;
    }
    return false;
  });
};

// The pattern's alternatives, each read on its own: `seed|user` searches "seed" or "user",
// never the phrase "seed a user".
const segmentWords = (pattern: string): string[][] =>
  pattern
    .split(/[|()]/)
    .map(wordsOf)
    .filter((words) => words.length > 0);

const MAX_REGEX_PATTERN = 200;

// Does a grep pattern search for this thesaurus word or phrase? Either one alternative of
// the pattern spells it (see `spells`), or the pattern, read as a regex, matches the whole
// phrase (`seed.*user`, `factor(y|ies)`). The regex reading also needs one of the pattern's
// literal runs of 3+ letters inside the phrase, so `.*` or `lock|.*` can't match everything,
// and it is skipped for long patterns and nested quantifiers, which can backtrack for seconds.
const searchesFor = (pattern: string, segments: string[][], phrase: string): boolean => {
  if (segments.some((words) => spells(words, phrase))) return true;
  const lowerPhrase = phrase.trim().toLowerCase();
  // A quantifier after a run binds only its last letter (`fixtures?`), so that letter is optional.
  const literals = [...pattern.replace(/\\[A-Za-z]/g, ' ').matchAll(/(\p{L}{3,})([?*{])?/gu)]
    .map(([, run = '', quantifier]) => (quantifier ? run.slice(0, -1) : run))
    .filter((literal) => literal.length >= 3);
  if (!literals.some((literal) => lowerPhrase.includes(literal.toLowerCase()))) return false;
  if (pattern.length > MAX_REGEX_PATTERN || /\)[+*{]/.test(pattern)) return false;
  try {
    new RegExp(pattern); // on its own first: `a)|(b` must not escape the anchors below
    return new RegExp(`^(?:${pattern})$`, 'i').test(lowerPhrase);
  } catch {
    return false; // ripgrep syntax JavaScript can't parse: the word reading still applied
  }
};

const conceptBlock = (graph: Graph, concept: string, label: string): string => {
  const files = graph.conceptToFiles[concept] ?? [];
  const sample = files.slice(0, MAX_CONCEPT_FILES).map((file) => `  ${file}`);
  const more =
    files.length > MAX_CONCEPT_FILES ? [`  … ${files.length - MAX_CONCEPT_FILES} more`] : [];
  const consumers = graph.usesConsumers[concept]?.length ?? 0;
  return [
    `${concept}${label} — ${files.length} file(s)${consumers > 0 ? `, ${consumers} consumer(s) via @uses` : ''}; \`bunx atlas query --partOf ${concept}\` lists all`,
    ...sample,
    ...more,
  ].join('\n');
};

// The grep-side lookup. First the thesaurus (`.atlas/thesaurus.ts`): words and phrases people
// search with, mapped by hand to the concepts they mean; a hit is labelled with the word so
// the agent knows a person made that mapping. Then concepts whose name the pattern's
// identifier names (exactly, or as a prefix either way once both are long enough to mean
// something), skipping any the thesaurus already showed.
export const renderConceptMatches = (graph: Graph, pattern: string): string | undefined => {
  const segments = segmentWords(pattern);
  const viaThesaurus = new Map<string, Set<string>>();
  for (const [phrase, concepts] of Object.entries(graph.thesaurus)) {
    if (phrase.trim() === '' || !searchesFor(pattern, segments, phrase)) continue;
    for (const concept of concepts)
      viaThesaurus.set(concept, (viaThesaurus.get(concept) ?? new Set()).add(phrase));
  }

  const token = identifierToken(pattern);
  const lower = token?.toLowerCase();
  const byName = lower
    ? Object.keys(graph.conceptToFiles).filter((concept) => {
        if (viaThesaurus.has(concept)) return false;
        const name = concept.split(':')[1]?.toLowerCase() ?? '';
        return (
          name === lower ||
          (name.length >= 5 && lower.startsWith(name)) ||
          (lower.length >= 5 && name.startsWith(lower))
        );
      })
    : [];

  const blocks = [
    ...[...viaThesaurus.keys()]
      .sort()
      .map((concept) =>
        conceptBlock(
          graph,
          concept,
          ` (thesaurus ${[...(viaThesaurus.get(concept) ?? [])].map((phrase) => `"${phrase}"`).join(', ')})`,
        ),
      ),
    ...byName.sort().map((concept) => conceptBlock(graph, concept, '')),
  ];
  if (blocks.length === 0) return undefined;
  return `atlas concept(s) matching "${pattern}":\n\n${blocks.join('\n\n')}`;
};
