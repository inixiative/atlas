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

// Each axis line: optional leading `*`, the @tag, an optional `?` tentative
// marker, then the comma-separated values.
const AXIS_LINE = /^\s*\*?\s*@([a-zA-Z][\w]*)(\??)[ \t]*(.*)$/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;

const dedupe = (values: string[]): string[] => [...new Set(values)];

const splitValues = (raw: string): string[] =>
  dedupe(
    raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  );

const OPENS_ATLAS = /(^|\n)\s*\*?\s*@atlas\b/;

// Locate the first block comment that opens with `@atlas`, returning its text
// and character span so the patcher can splice a regenerated block in place.
export const locateAtlasBlock = (
  source: string,
): { start: number; end: number; text: string } | null => {
  BLOCK_COMMENT.lastIndex = 0;
  for (let m = BLOCK_COMMENT.exec(source); m !== null; m = BLOCK_COMMENT.exec(source)) {
    if (OPENS_ATLAS.test(m[0])) {
      return { start: m.index, end: m.index + m[0].length, text: m[0] };
    }
  }
  return null;
};

// Parse the first block comment that opens with `@atlas`. Returns null if the
// file carries no atlas block. Parsing is scoped to that block, so a stray
// `@uses` in code or prose elsewhere never false-matches.
export const parseAtlasBlock = (source: string): AtlasAnnotation | null => {
  const located = locateAtlasBlock(source);
  if (!located) return null;
  const atlasBlock = located.text;

  const axes: Record<string, string[]> = {};
  let pinned = false;
  // @uses is resolved from the whole block, not last-line-wins, so multi-line or
  // mixed `@uses none, x` can't produce a state that disagrees with the values.
  let usesSeen = false;
  let usesNone = false;
  let usesProposed = false;
  const usesValues: string[] = [];

  // split on \r?\n so CRLF files don't leave a trailing \r polluting values.
  for (const line of atlasBlock.split(/\r?\n/)) {
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
