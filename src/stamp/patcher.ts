import {
  type AtlasAnnotation,
  locateAtlasBlock,
  mentionsAtlas,
  parseAtlasBlock,
  type UsesState,
} from '../parse/parseAtlasBlock.ts';
import { type CommentStyle, preambleEnd } from '../syntax/comments.ts';

export type BlockSpec = {
  kind?: string[];
  partOf?: string[];
  uses?: string[];
  usesState?: UsesState;
  constructs?: string[];
  pinned?: boolean;
};

// What the rules produce for a file — the derivable axes only (@uses is never
// auto-stamped). `constructs` is optional because not every rule set touches it.
export type StampInput = {
  kind?: string[];
  partOf?: string[];
  constructs?: string[];
};

export type StampMode = 'additive' | 'overwrite';

const axis = (name: string, values: string[]): string => `@${name} ${values.join(', ')}`;

// Render a canonical `@atlas` block in the file's comment style. Axis order is fixed for
// diff-stability.
export const renderBlock = (spec: BlockSpec, style: CommentStyle): string => {
  const axes = [spec.pinned ? '@atlas pin' : '@atlas'];
  if (spec.kind?.length) axes.push(axis('kind', spec.kind));
  if (spec.partOf?.length) axes.push(axis('partOf', spec.partOf));
  if (spec.usesState === 'none') axes.push('@uses none');
  else if (spec.usesState === 'proposed' && spec.uses?.length) axes.push(axis('uses?', spec.uses));
  else if (spec.usesState === 'values' && spec.uses?.length) axes.push(axis('uses', spec.uses));
  if (spec.constructs?.length) axes.push(axis('constructs', spec.constructs));
  if (style.shape === 'line')
    return axes.map((a) => `${style.writePrefix ?? style.prefix} ${a}`).join('\n');
  return [style.writeOpen, ...axes.map((a) => `${style.line}${a}`), style.writeClose].join('\n');
};

const union = (a: string[] = [], b: string[] = []): string[] => [...new Set([...a, ...b])];

const detectEol = (source: string): string => (source.includes('\r\n') ? '\r\n' : '\n');

// Renders the canonical (LF) block, then matches the file's existing EOL so a
// CRLF file round-trips without churn or mixed endings.
const renderWithEol = (spec: BlockSpec, style: CommentStyle, eol: string): string =>
  eol === '\n' ? renderBlock(spec, style) : renderBlock(spec, style).replaceAll('\n', eol);

const carryUses = (existing: AtlasAnnotation | null): Pick<BlockSpec, 'uses' | 'usesState'> =>
  existing ? { uses: existing.uses, usesState: existing.usesState } : {};

// Why a file that needs a fresh block didn't get one: it already has an `@atlas` comment no
// block parses from (a second block would hide it), or its language allows none where atlas
// would put it (a PHP file that starts as HTML).
export type StampSkip = 'unreadable' | 'no-place';

// Merge a stamp into a file's source per mode. Returns the new content and
// whether anything changed (idempotent: a no-op re-stamp reports changed=false).
// `path` decides where a fresh block goes (below the file's preamble).
export const applyStamp = (
  source: string,
  resolved: StampInput,
  file: { path: string; style: CommentStyle },
  mode: StampMode = 'additive',
): { content: string; changed: boolean; skipped?: StampSkip } => {
  const { style } = file;
  const existing = parseAtlasBlock(source, style);
  const located = locateAtlasBlock(source, style);
  const eol = detectEol(source);

  // No block yet — insert a fresh one at the top (uses omitted = uncurated), but below
  // the lines that must stay first (a shebang, front matter, `<?php`; see preambleEnd).
  if (!existing || !located) {
    const spec: BlockSpec = {
      kind: resolved.kind ?? [],
      partOf: [...(resolved.partOf ?? [])].sort(),
      constructs: resolved.constructs ?? [],
    };
    const hasAny = [spec.kind, spec.partOf, spec.constructs].some((v) => v && v.length);
    if (!hasAny) return { content: source, changed: false };
    if (mentionsAtlas(source, style))
      return { content: source, changed: false, skipped: 'unreadable' };
    const at = preambleEnd(file.path, source);
    const head = source.slice(0, at);
    const rest = source.slice(at);
    if (style.placeAfter && !style.placeAfter.test(head))
      return { content: source, changed: false, skipped: 'no-place' };
    // a preamble that ends the file without a newline still gets one before the block
    const before = head !== '' && !head.endsWith('\n') ? eol : '';
    const blank = style.blankAfter && rest !== '' && !/^\r?\n/.test(rest) ? eol : '';
    const block = renderWithEol(spec, style, eol);
    return { content: head + before + block + eol + blank + rest, changed: true };
  }

  // Overwrite is exempt on a pinned block — the hand-curated overload wins.
  if (mode === 'overwrite' && existing.pinned) return { content: source, changed: false };

  const pick = (next: string[] | undefined, prev: string[]): string[] =>
    next && next.length ? next : prev;

  const merged: BlockSpec =
    mode === 'overwrite'
      ? {
          // resync the derivable axes to the rules; keep curated @uses
          kind: pick(resolved.kind, existing.kind),
          partOf: pick(resolved.partOf, existing.partOf),
          constructs: pick(resolved.constructs, existing.constructs),
          ...carryUses(existing),
          pinned: existing.pinned,
        }
      : {
          // additive: add what's absent, never remove, never touch @uses
          kind: union(existing.kind, resolved.kind),
          partOf: union(existing.partOf, resolved.partOf),
          constructs: union(existing.constructs, resolved.constructs),
          ...carryUses(existing),
          pinned: existing.pinned,
        };
  // @partOf is sorted so a merged block matches a freshly-stamped one (stampFor sorts).
  merged.partOf = [...(merged.partOf ?? [])].sort();

  const block = renderWithEol(merged, style, eol);
  if (block === located.text) return { content: source, changed: false };
  return {
    content: source.slice(0, located.start) + block + source.slice(located.end),
    changed: true,
  };
};
