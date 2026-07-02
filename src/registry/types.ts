// A concept entry is a generic bag of named string lists. atlas hardcodes NO
// field names — the CONSUMER defines its categories (docs, module, integration,
// package, …). Reference categories (e.g. docs) drive the doc→concept inversion;
// constituent categories (e.g. module) fill @partOf during stamping. That
// distinction lives in the consuming repo's config, never in atlas.
export type ConceptEntry = Record<string, string[]>;

// Keyed `class:name` (e.g. 'feature:tenancy'). The single source of valid concepts.
// The concept CLASS is just the prefix before ':' — also consumer-defined, derived
// from these keys, never an enum atlas ships.
export type ConceptRegistry = Record<string, ConceptEntry>;

// `class:name` → its class (the prefix). Returns null for a malformed key.
export const conceptClass = (key: string): string | null => {
  const idx = key.indexOf(':');
  return idx > 0 ? key.slice(0, idx) : null;
};

// The set of concept classes present in a registry (sorted, unique).
export const conceptClasses = (registry: ConceptRegistry): string[] =>
  [
    ...new Set(
      Object.keys(registry)
        .map(conceptClass)
        .filter((c): c is string => c !== null),
    ),
  ].sort();
