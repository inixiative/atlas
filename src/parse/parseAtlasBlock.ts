import type { CommentStyle } from '../syntax/comments.ts';

// @uses carries curation state — its absence is meaningful (uncurated) and
// distinct from an explicit empty (curated-empty), which is distinct from a
// patcher proposal awaiting human acceptance.
export type UsesState = 'absent' | 'none' | 'values' | 'proposed';

export type AtlasAnnotation = {
  kind: string[];
  partOf: string[];
  uses: string[];
  usesState: UsesState;
  constructs: string[];
  // `@atlas pin` on the opener — exempts the file's derivable axes from
  // `atlas stamp --overwrite` (a hand-curated overload the rules must not clobber).
  pinned: boolean;
  // every parsed axis (name without @, the `@atlas` opener excluded) → values.
  axes: Record<string, string[]>;
};

// Each axis line, once its comment decoration is stripped: an optional leading `*`, the @tag,
// an optional `?` tentative marker, then the comma-separated values.
const AXIS_LINE = /^\s*\*?\s*@([a-zA-Z][\w]*)(\??)[ \t]*(.*)$/;
const OPENS_ATLAS = /^\s*\*?\s*@atlas\b/;

const dedupe = (values: string[]): string[] => [...new Set(values)];

const splitValues = (raw: string): string[] =>
  dedupe(
    raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  );

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type BlockStyle = Extract<CommentStyle, { shape: 'block' }>;
type LineStyle = Extract<CommentStyle, { shape: 'line' }>;

export type LocatedBlock = { start: number; end: number; text: string };

// A line comment: the prefix, any repeats of its last character (`;;`, `##`, `---`, `///`), then
// the text the axis grammar reads.
const lineComment = (style: LineStyle): RegExp =>
  new RegExp(
    `^[ \\t]*${escapeRegex(style.prefix)}${escapeRegex(style.prefix.slice(-1))}*(.*?)\\r?$`,
  );

// A one-line block holding only `@atlas` (`<!-- @atlas -->`, `/** @atlas pin */`) is a block
// waiting for its axes. A block a formatter collapsed onto one line (`/** * @atlas * @kind x */`)
// is not: it stays unreadable, and `check` reports it instead of reading a block with no tags.
const ONLY_OPENER = /^\s*\*?\s*@atlas(?:[ \t]+pin)?\s*$/;

// The lines of a comment as the axis grammar reads them. Line comments lose their prefix. Block
// comments keep their lines as written (AXIS_LINE reads past a ` * `), each axis on its own line.
export const commentBody = (text: string, style: CommentStyle): string[] => {
  if (style.shape === 'line') {
    const comment = lineComment(style);
    return text.split(/\r?\n/).map((raw) => comment.exec(raw)?.[1] ?? raw);
  }
  if (!text.includes('\n') && text.startsWith(style.open) && text.endsWith(style.close)) {
    const inner = text.slice(style.open.length, -style.close.length).replace(/^\*+/, '');
    if (ONLY_OPENER.test(inner)) return [inner];
  }
  return text.split(/\r?\n/);
};

// Block styles: the first comment with an `@atlas` line.
const locateInBlocks = (source: string, style: BlockStyle): LocatedBlock | null => {
  const comment = new RegExp(
    `${escapeRegex(style.open)}[\\s\\S]*?${escapeRegex(style.close)}`,
    'g',
  );
  for (let m = comment.exec(source); m !== null; m = comment.exec(source)) {
    if (commentBody(m[0], style).some((line) => OPENS_ATLAS.test(line))) {
      return { start: m.index, end: m.index + m[0].length, text: m[0] };
    }
  }
  return null;
};

// Line styles: the first comment line reading `@atlas`, then the axis lines after it (an empty
// comment line between two axis lines is bridged). The block ends at its last axis line and stops
// at the first other line, so prose comments next to it are never part of it, and the stamper
// never rewrites them.
const locateInLines = (source: string, style: LineStyle): LocatedBlock | null => {
  const comment = lineComment(style);
  let offset = 0;
  let start = -1;
  let end = -1;
  for (const line of source.split('\n')) {
    const body = comment.exec(line)?.[1];
    const lineEnd = offset + line.replace(/\r$/, '').length;
    if (start < 0) {
      if (body !== undefined && OPENS_ATLAS.test(body)) {
        start = offset;
        end = lineEnd;
      }
    } else if (body !== undefined && AXIS_LINE.test(body)) {
      end = lineEnd;
    } else if (body === undefined || body.trim() !== '') break;
    offset += line.length + 1;
  }
  return start < 0 ? null : { start, end, text: source.slice(start, end) };
};

// Does a comment in the file's own style name `@atlas`? When one does but no block parses from
// it (collapsed onto one line, mangled by hand), the stamper must not add a second block.
const NAMES_ATLAS = /(?:^|[\s*])@atlas\b/;
export const mentionsAtlas = (source: string, style: CommentStyle): boolean => {
  if (style.shape === 'line') {
    const comment = lineComment(style);
    return source.split('\n').some((line) => NAMES_ATLAS.test(comment.exec(line)?.[1] ?? ''));
  }
  const comment = new RegExp(
    `${escapeRegex(style.open)}[\\s\\S]*?${escapeRegex(style.close)}`,
    'g',
  );
  return [...source.matchAll(comment)].some((m) => NAMES_ATLAS.test(m[0].slice(style.open.length)));
};

// Locate the first comment that opens with `@atlas`, in the file's comment style, returning its
// text and character span so the patcher can splice a regenerated block in place.
export const locateAtlasBlock = (source: string, style: CommentStyle): LocatedBlock | null =>
  style.shape === 'block' ? locateInBlocks(source, style) : locateInLines(source, style);

// Parse the first comment that opens with `@atlas`, in the file's comment style. Returns null if
// the file carries no atlas block. Parsing is scoped to that block, so a stray `@uses` in code or
// prose elsewhere never false-matches.
export const parseAtlasBlock = (source: string, style: CommentStyle): AtlasAnnotation | null => {
  const located = locateAtlasBlock(source, style);
  if (!located) return null;

  const axes: Record<string, string[]> = {};
  let pinned = false;
  // @uses is resolved from the whole block, not last-line-wins, so multi-line or
  // mixed `@uses none, x` can't produce a state that disagrees with the values.
  let usesSeen = false;
  let usesNone = false;
  let usesProposed = false;
  const usesValues: string[] = [];

  // commentBody splits on \r?\n, so CRLF files don't leave a trailing \r polluting values.
  for (const line of commentBody(located.text, style)) {
    const m = AXIS_LINE.exec(line);
    if (!m) continue;
    const [, name, tentative, rest] = m;
    if (name === 'atlas') {
      if (splitValues(rest ?? '').includes('pin')) pinned = true;
      continue;
    }

    const values = splitValues(rest ?? '');

    if (name === 'uses') {
      usesSeen = true;
      if (tentative === '?') usesProposed = true;
      if (values.includes('none')) usesNone = true;
      usesValues.push(...values.filter((v) => v !== 'none'));
      continue;
    }

    axes[name!] = dedupe([...(axes[name!] ?? []), ...values]);
  }

  // Real values always win over a stray `none`; absent (no line) is distinct
  // from curated-empty (`@uses none` / a bare `@uses`).
  const uses = dedupe(usesValues);
  const usesState: UsesState =
    uses.length > 0
      ? usesProposed
        ? 'proposed'
        : 'values'
      : usesNone || usesSeen
        ? 'none'
        : 'absent';
  if (usesSeen) axes.uses = uses;

  return {
    kind: axes.kind ?? [],
    partOf: axes.partOf ?? [],
    uses,
    usesState,
    constructs: axes.constructs ?? [],
    pinned,
    axes,
  };
};
