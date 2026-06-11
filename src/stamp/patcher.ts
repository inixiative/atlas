import { type AtlasAnnotation, locateAtlasBlock, parseAtlasBlock, type UsesState } from '../parse/parseAtlasBlock.ts';

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

const line = (axis: string, values: string[]): string => ` * @${axis} ${values.join(', ')}`;

// Render a canonical `@atlas` block. Axis order is fixed for diff-stability.
export const renderBlock = (spec: BlockSpec): string => {
  const lines = ['/**', spec.pinned ? ' * @atlas pin' : ' * @atlas'];
  if (spec.kind?.length) lines.push(line('kind', spec.kind));
  if (spec.partOf?.length) lines.push(line('partOf', spec.partOf));
  if (spec.usesState === 'none') lines.push(' * @uses none');
  else if (spec.usesState === 'proposed' && spec.uses?.length) lines.push(line('uses?', spec.uses));
  else if (spec.usesState === 'values' && spec.uses?.length) lines.push(line('uses', spec.uses));
  if (spec.constructs?.length) lines.push(line('constructs', spec.constructs));
  lines.push(' */');
  return lines.join('\n');
};

const union = (a: string[] = [], b: string[] = []): string[] => [...new Set([...a, ...b])];

const detectEol = (source: string): string => (source.includes('\r\n') ? '\r\n' : '\n');

// Renders the canonical (LF) block, then matches the file's existing EOL so a
// CRLF file round-trips without churn or mixed endings.
const renderWithEol = (spec: BlockSpec, eol: string): string =>
  eol === '\n' ? renderBlock(spec) : renderBlock(spec).replaceAll('\n', eol);

// A fresh block belongs at the top, but below a shebang (moving it above would
// break an executable script).
const SHEBANG = /^#![^\n]*\n/;

const carryUses = (existing: AtlasAnnotation | null): Pick<BlockSpec, 'uses' | 'usesState'> =>
  existing ? { uses: existing.uses, usesState: existing.usesState } : {};

// Merge a stamp into a file's source per mode. Returns the new content and
// whether anything changed (idempotent: a no-op re-stamp reports changed=false).
export const applyStamp = (
  source: string,
  resolved: StampInput,
  mode: StampMode = 'additive',
): { content: string; changed: boolean } => {
  const existing = parseAtlasBlock(source);
  const located = locateAtlasBlock(source);
  const eol = detectEol(source);

  // No block yet — insert a fresh one at the top (uses omitted = uncurated),
  // but below a shebang so an executable file keeps working.
  if (!existing || !located) {
    const spec: BlockSpec = {
      kind: resolved.kind ?? [],
      partOf: [...(resolved.partOf ?? [])].sort(),
      constructs: resolved.constructs ?? [],
    };
    const hasAny = [spec.kind, spec.partOf, spec.constructs].some((v) => v && v.length);
    if (!hasAny) return { content: source, changed: false };
    const block = renderWithEol(spec, eol);
    const shebang = SHEBANG.exec(source)?.[0];
    const content = shebang
      ? shebang + block + eol + source.slice(shebang.length)
      : block + eol + source;
    return { content, changed: true };
  }

  // Overwrite is exempt on a pinned block — the hand-curated overload wins.
  if (mode === 'overwrite' && existing.pinned) return { content: source, changed: false };

  const pick = (next: string[] | undefined, prev: string[]): string[] => (next && next.length ? next : prev);

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

  const block = renderWithEol(merged, eol);
  if (block === located.text) return { content: source, changed: false };
  return { content: source.slice(0, located.start) + block + source.slice(located.end), changed: true };
};
