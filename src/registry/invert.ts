import type { SeamRegistry } from './types.ts';

// The bidirectionality the whole thing is for: from a forward declaration
// (seam → values of a field) derive the inverse (value → seam keys).
//
//   invert(seams, 'module')  → module → seam[]  (drives @partOf stamping)
//   invert(seams, 'tickets') → ticket → seam[]  ("what does FEAT-001 touch")
//   invert(seams, 'docs')    → doc → seam[]
//
// Seam-key lists are sorted for deterministic, diff-stable output.
export const invert = (registry: SeamRegistry, field: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const [seamKey, entry] of Object.entries(registry)) {
    const values = entry[field];
    if (!values) continue;
    for (const value of values) {
      (out[value] ??= []).push(seamKey);
    }
  }
  for (const value of Object.keys(out)) out[value]!.sort();
  return out;
};
