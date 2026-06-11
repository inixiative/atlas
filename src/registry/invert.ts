import type { ConceptRegistry } from './types.ts';

// The bidirectionality the whole thing is for: from a forward declaration
// (concept → values of a field) derive the inverse (value → concept keys).
//
//   invert(concepts, 'module')  → module → concept[]  (drives @partOf stamping)
//   invert(concepts, 'docs')    → doc → concept[]      ("which concepts does AUTH.md cover")
//
// Concept-key lists are sorted for deterministic, diff-stable output.
export const invert = (registry: ConceptRegistry, field: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const [conceptKey, entry] of Object.entries(registry)) {
    const values = entry[field];
    if (!values) continue;
    for (const value of values) {
      (out[value] ??= []).push(conceptKey);
    }
  }
  for (const value of Object.keys(out)) out[value]!.sort();
  return out;
};
