// @uses carries curation state — its absence is meaningful (uncurated) and
// distinct from an explicit empty (curated-empty), which is distinct from a
// patcher proposal awaiting human acceptance.
export type UsesState = 'absent' | 'none' | 'values' | 'proposed';

export type AtlasAnnotation = {
  kind: string[];
  partOf: string[];
  uses: string[];
  usesState: UsesState;
  concern: string[];
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

const splitValues = (raw: string): string[] =>
  raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

const OPENS_ATLAS = /(^|\n)\s*\*?\s*@atlas\b/;

// Locate the first block comment that opens with `@atlas`, returning its text
// and character span so the patcher can splice a regenerated block in place.
export const locateAtlasBlock = (source: string): { start: number; end: number; text: string } | null => {
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
  let usesState: UsesState = 'absent';
  let pinned = false;

  for (const line of atlasBlock.split('\n')) {
    const m = AXIS_LINE.exec(line);
    if (!m) continue;
    const [, name, tentative, rest] = m;
    if (name === 'atlas') {
      if (splitValues(rest ?? '').includes('pin')) pinned = true;
      continue;
    }

    const values = splitValues(rest ?? '');

    if (name === 'uses') {
      if (tentative === '?') usesState = 'proposed';
      else if (values.length === 1 && values[0] === 'none') usesState = 'none';
      else if (values.length > 0) usesState = 'values';
      const resolved = usesState === 'none' ? [] : values;
      axes.uses = [...(axes.uses ?? []), ...resolved];
      continue;
    }

    axes[name!] = [...(axes[name!] ?? []), ...values];
  }

  return {
    kind: axes.kind ?? [],
    partOf: axes.partOf ?? [],
    uses: axes.uses ?? [],
    usesState,
    concern: axes.concern ?? [],
    constructs: axes.constructs ?? [],
    pinned,
    axes,
  };
};
