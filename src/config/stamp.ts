import { invert } from '../registry/invert.ts';
import type { ConceptRegistry } from '../registry/types.ts';
import { isPartOfFor, type StampRule, type TagValue } from './defineConfig.ts';
import { type Captures, matchGlob } from './glob.ts';

// The materialized @atlas axes a set of stamp rules produce for one file.
// @uses is deliberately absent — it is never auto-stamped.
export type ResolvedStamp = {
  kind: string[];
  partOf: string[];
  constructs: string[];
  // partOfFor captures that matched no concept — surfaced by `coverage`, never an error.
  unresolved: { category: string; value: string }[];
};

const interpolate = (template: string, caps: Captures): string | null => {
  let missing = false;
  const out = template.replace(/\$(\d+)/g, (_, n: string) => {
    const v = caps[Number.parseInt(n, 10)];
    if (v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
};

const dedupe = (values: string[]): string[] => [...new Set(values)];

const toArray = (v: TagValue): (string | TagValue)[] => (Array.isArray(v) ? v : [v]);

// Resolve one tag value (literal, list, or partOfFor descriptor) into concrete
// strings, recording any membership capture that resolves to nothing.
const resolveTag = (
  value: TagValue,
  caps: Captures,
  registry: ConceptRegistry,
  unresolved: { category: string; value: string }[],
): string[] => {
  const out: string[] = [];
  for (const item of toArray(value)) {
    if (isPartOfFor(item)) {
      const segment = interpolate(item.capture, caps);
      if (segment === null) continue;
      const concepts = invert(registry, item.category)[segment];
      if (!concepts || concepts.length === 0) {
        unresolved.push({ category: item.category, value: segment });
        continue;
      }
      out.push(...concepts);
    } else if (typeof item === 'string') {
      const resolved = interpolate(item, caps);
      if (resolved !== null) out.push(resolved);
    }
  }
  return out;
};

// Compose EVERY matching rule's contributions for a file (not first-match-wins).
export const stampFor = (path: string, rules: StampRule[], registry: ConceptRegistry): ResolvedStamp => {
  const kind: string[] = [];
  const partOf: string[] = [];
  const constructs: string[] = [];
  const unresolved: { category: string; value: string }[] = [];

  for (const rule of rules) {
    if (rule.exclude) {
      const excludes = Array.isArray(rule.exclude) ? rule.exclude : [rule.exclude];
      if (excludes.some((pattern) => matchGlob(pattern, path))) continue;
    }

    const patterns = Array.isArray(rule.include) ? rule.include : [rule.include];
    let caps: Captures | null = null;
    for (const pattern of patterns) {
      caps = matchGlob(pattern, path);
      if (caps) break;
    }
    if (!caps) continue;

    if (rule.kind) kind.push(...resolveTag(rule.kind, caps, registry, unresolved));
    if (rule.partOf) partOf.push(...resolveTag(rule.partOf, caps, registry, unresolved));
    if (rule.constructs) constructs.push(...resolveTag(rule.constructs, caps, registry, unresolved));
  }

  return {
    kind: dedupe(kind),
    partOf: dedupe(partOf).sort(),
    constructs: dedupe(constructs),
    unresolved,
  };
};
