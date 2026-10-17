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
const MAX_THESAURUS_CONCEPTS = 8;
const MAX_QUOTED_PATTERN = 80;

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

// The conjugations a search may use for a word, by a small suffix rule (no stemmer): plural
// `-s`/`-es`, `-ing`, `-ed`, `-er`; a final `e` drops before a vowel suffix (serialize →
// serializing, serialized, serializer); a final consonant after a single vowel doubles (log →
// logging, logger; stop → stopped); a consonant + `y` becomes `-ies`/`-ied` (factory →
// factories). Words under three letters are taken as written, and a 3-letter word keeps its
// `e` before `-er`, so "use" reaches `using` and `used` but never `user`.
const conjugations = (word: string): string[] => {
  if (word.length < 3) return [word];
  const forms = [word, `${word}s`, `${word}es`, `${word}ing`, `${word}ed`, `${word}er`];
  const stem = word.slice(0, -1);
  if (word.endsWith('e'))
    forms.push(`${stem}ing`, `${stem}ed`, ...(word.length >= 4 ? [`${stem}er`] : []));
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(word))
    forms.push(...['ing', 'ed', 'er'].map((suffix) => word + word.slice(-1) + suffix));
  if (/[^aeiou]y$/.test(word)) forms.push(`${stem}ies`, `${stem}ied`);
  return forms;
};

// A phrase, prepared once per hook call: its words, each word's conjugations, and the longest
// text a match could span (so a long pattern is only scanned that far from each start).
type PreparedPhrase = { phrase: string; words: string[]; forms: string[][]; maxLength: number };

const preparePhrase = (phrase: string): PreparedPhrase => {
  const words = wordsOf(phrase);
  const forms = words.map(conjugations);
  const maxLength = forms.reduce((sum, list) => sum + Math.max(...list.map((f) => f.length)), 0);
  return { phrase, words, forms, maxLength };
};

// One alternative of the pattern: its words joined, and where each word ends in that text.
type Segment = { text: string; ends: number[] };

// The pattern's alternatives, each read on its own: `seed|user` searches "seed" or "user",
// never the phrase "seed a user". An escaped `\(`, `\)` or `\|` is a literal, not a boundary.
const segmentsOf = (pattern: string): Segment[] =>
  pattern
    .replace(/\\[|()]/g, ' ')
    .split(/[|()]/)
    .map(wordsOf)
    .filter((words) => words.length > 0)
    .map((words) => {
      let at = 0;
      return { text: words.join(''), ends: words.map((word) => (at += word.length)) };
    });

// Does a run of consecutive pattern words spell the phrase, each phrase word in one of its
// conjugations? Compared joined, so the split doesn't matter: `seedingUsers` spells "seed a
// user", `createGitHubClient` spells "github", `github` spells "GitHub". The run starts and ends
// on word boundaries, so `unlock` never spells "lock" and `lockfile` never does either.
const spells = ({ text, ends }: Segment, { words, forms, maxLength }: PreparedPhrase): boolean => {
  if (words.length === 0) return false;
  const boundaries = new Set(ends);
  const walk = (i: number, at: number, limit: number): boolean =>
    i === forms.length
      ? boundaries.has(at)
      : (forms[i] ?? []).some(
          (form) =>
            at + form.length <= limit &&
            text.startsWith(form, at) &&
            walk(i + 1, at + form.length, limit),
        );
  return [0, ...ends.slice(0, -1)].some((start) => walk(0, start, start + maxLength));
};

const MAX_REGEX_PATTERN = 200;
const MAX_UNBOUNDED_QUANTIFIERS = 4;

// The pattern read as a regex over a whole phrase, compiled once per hook call, or not at all
// for long patterns, nested or piled-up quantifiers (they backtrack for seconds in JavaScript),
// and syntax JavaScript can't parse (the word reading still applies).
type RegexReading = { regex: RegExp; literals: string[] } | undefined;

const regexReadingOf = (pattern: string): RegexReading => {
  if (pattern.length > MAX_REGEX_PATTERN || /\)[+*{]/.test(pattern)) return undefined;
  if ((pattern.match(/[*+]|\{\d+,\}/g) ?? []).length > MAX_UNBOUNDED_QUANTIFIERS) return undefined;
  // A quantifier after a run binds only its last letter (`fixtures?`), so that letter is optional.
  const literals = [...pattern.replace(/\\[A-Za-z]/g, ' ').matchAll(/(\p{L}{3,})([?*{])?/gu)]
    .map(([, run = '', quantifier]) => (quantifier ? run.slice(0, -1) : run).toLowerCase())
    .filter((literal) => literal.length >= 3);
  if (literals.length === 0) return undefined;
  try {
    new RegExp(pattern); // on its own first: `a)|(b` must not escape the anchors below
    return { regex: new RegExp(`^(?:${pattern})$`, 'i'), literals };
  } catch {
    return undefined;
  }
};

// Does a grep pattern search for this thesaurus phrase? Either one alternative of the pattern
// spells it (see `spells`), or the pattern, read as a regex, matches the whole phrase
// (`seed.*user`, `factor(y|ies)`). The regex reading also needs one of the pattern's own
// literal words to start a word of the phrase, so `.*` matches nothing and `lock|.*` reaches
// "lock" but not "unlock".
const searchesFor = (
  segments: Segment[],
  reading: RegexReading,
  phrase: PreparedPhrase,
): boolean => {
  if (segments.some((segment) => spells(segment, phrase))) return true;
  if (!reading) return false;
  const { regex, literals } = reading;
  if (!literals.some((literal) => phrase.words.some((word) => word.startsWith(literal))))
    return false;
  return regex.test(phrase.phrase.trim());
};

const conceptBlock = (graph: Graph, concept: string, label: string): string => {
  const files = graph.conceptToFiles[concept] ?? [];
  const sample = files.slice(0, MAX_CONCEPT_FILES).map((file) => `  ${file}`);
  const more =
    files.length > MAX_CONCEPT_FILES ? [`  … ${files.length - MAX_CONCEPT_FILES} more`] : [];
  const consumers = graph.usesConsumers[concept]?.length ?? 0;
  const doc = graph.thesaurus[concept]?.doc;
  return [
    `${concept}${label} — ${files.length} file(s)${consumers > 0 ? `, ${consumers} consumer(s) via @uses` : ''}; \`bunx atlas query --partOf ${concept}\` lists all`,
    ...(doc ? [`  read: ${doc}`] : []),
    ...sample,
    ...more,
  ].join('\n');
};

// The grep-side lookup. First the thesaurus (`.atlas/thesaurus.ts`): each concept's phrases,
// the words people search with when they mean it; a hit is labelled with the phrase so the
// agent knows a person made that mapping, and points at the concept's doc. Then concepts
// whose name the pattern's identifier names (exactly, or as a prefix either way once both are
// long enough to mean something), skipping any the thesaurus already showed.
export const renderConceptMatches = (graph: Graph, pattern: string): string | undefined => {
  const segments = segmentsOf(pattern);
  const reading = regexReadingOf(pattern);
  const viaThesaurus = new Map<string, string[]>();
  for (const [concept, { phrases }] of Object.entries(graph.thesaurus)) {
    const hits = [...new Set(phrases)].filter((phrase) =>
      searchesFor(segments, reading, preparePhrase(phrase)),
    );
    if (hits.length > 0) viaThesaurus.set(concept, hits);
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

  // A broad phrase on many concepts must not crowd out the rest of the answer.
  const thesaurusHits = [...viaThesaurus.entries()].sort(([a], [b]) => a.localeCompare(b));
  const shown = thesaurusHits.slice(0, MAX_THESAURUS_CONCEPTS);
  const hidden = thesaurusHits.length - shown.length;
  const blocks = [
    ...shown.map(([concept, hits]) =>
      conceptBlock(
        graph,
        concept,
        ` (thesaurus ${hits.map((phrase) => `"${phrase}"`).join(', ')})`,
      ),
    ),
    ...(hidden > 0 ? [`… ${hidden} more concept(s) via the thesaurus; narrow the pattern`] : []),
    ...byName.sort().map((concept) => conceptBlock(graph, concept, '')),
  ];
  if (blocks.length === 0) return undefined;
  const quoted =
    pattern.length > MAX_QUOTED_PATTERN ? `${pattern.slice(0, MAX_QUOTED_PATTERN)}…` : pattern;
  return `atlas concept(s) matching "${quoted}":\n\n${blocks.join('\n\n')}`;
};
