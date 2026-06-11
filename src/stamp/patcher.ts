import { type AtlasAnnotation, locateAtlasBlock, parseAtlasBlock, type UsesState } from '../parse/parseAtlasBlock.ts';

export type BlockSpec = {
  kind?: string[];
  partOf?: string[];
  uses?: string[];
  usesState?: UsesState;
  concern?: string[];
  constructs?: string[];
  pinned?: boolean;
};

// What the rules produce for a file — the derivable axes only (@uses is never
// auto-stamped). `concern`/`constructs` are optional because not every rule set
// touches them.
export type StampInput = {
  kind?: string[];
  partOf?: string[];
  concern?: string[];
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
  if (spec.concern?.length) lines.push(line('concern', spec.concern));
  if (spec.constructs?.length) lines.push(line('constructs', spec.constructs));
  lines.push(' */');
  return lines.join('\n');
};

const union = (a: string[] = [], b: string[] = []): string[] => [...new Set([...a, ...b])];

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

  // No block yet — insert a fresh one at the top (uses omitted = uncurated).
  if (!existing || !located) {
    const spec: BlockSpec = {
      kind: resolved.kind ?? [],
      partOf: resolved.partOf ?? [],
      concern: resolved.concern ?? [],
      constructs: resolved.constructs ?? [],
    };
    const hasAny = [spec.kind, spec.partOf, spec.concern, spec.constructs].some((v) => v && v.length);
    if (!hasAny) return { content: source, changed: false };
    return { content: `${renderBlock(spec)}\n${source}`, changed: true };
  }

  // Overwrite is exempt on a pinned block — the hand-curated overload wins.
  if (mode === 'overwrite' && existing.pinned) return { content: source, changed: false };

  const pick = (next: string[] | undefined, prev: string[]): string[] => (next && next.length ? next : prev);

  const merged: BlockSpec =
    mode === 'overwrite'
      ? {
          // resync the derivable axes to the rules; keep curated @uses/@concern
          kind: pick(resolved.kind, existing.kind),
          partOf: pick(resolved.partOf, existing.partOf),
          constructs: pick(resolved.constructs, existing.constructs),
          concern: existing.concern,
          ...carryUses(existing),
          pinned: existing.pinned,
        }
      : {
          // additive: add what's absent, never remove, never touch @uses
          kind: union(existing.kind, resolved.kind),
          partOf: union(existing.partOf, resolved.partOf),
          concern: union(existing.concern, resolved.concern),
          constructs: union(existing.constructs, resolved.constructs),
          ...carryUses(existing),
          pinned: existing.pinned,
        };

  const block = renderBlock(merged);
  if (block === located.text) return { content: source, changed: false };
  return { content: source.slice(0, located.start) + block + source.slice(located.end), changed: true };
};
