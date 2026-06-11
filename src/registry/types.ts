// A seam entry is a generic bag of named string lists. atlas hardcodes NO
// field names — the CONSUMER defines its categories (docs, tickets, module,
// integration, package, …). Reference categories (e.g. docs/tickets) drive the
// doc→seam / ticket→seam inversions; constituent categories (e.g. module)
// fill @partOf during stamping. That distinction lives in the consuming repo's
// config, never in atlas.
export type SeamEntry = Record<string, string[]>;

// Keyed `class:name` (e.g. 'feature:tenancy'). The single source of valid seams.
// The seam CLASS is just the prefix before ':' — also consumer-defined, derived
// from these keys, never an enum atlas ships.
export type SeamRegistry = Record<string, SeamEntry>;

// `class:name` → its class (the prefix). Returns null for a malformed key.
export const seamClass = (key: string): string | null => {
  const idx = key.indexOf(':');
  return idx > 0 ? key.slice(0, idx) : null;
};

// The set of seam classes present in a registry (sorted, unique).
export const seamClasses = (registry: SeamRegistry): string[] =>
  [...new Set(Object.keys(registry).map(seamClass).filter((c): c is string => c !== null))].sort();
