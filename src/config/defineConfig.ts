import type { ConceptRegistry } from '../registry/types.ts';

// `partOfFor` is a LAZY descriptor, not a value. The consumer's config.ts can
// reference it before the concept registry is loaded; the stamp engine resolves it
// later against the loaded registry. This is what lets `.atlas/config.ts` and
// `.atlas/concepts.ts` be separate files with no evaluation-order coupling.
export type PartOfForDescriptor = { __atlasPartOfFor: true; category: string; capture: string };

// Fill @partOf by resolving a captured path segment through the inverse of a
// consumer-defined constituent category:  partOfFor('module', '$1').
// `category` and `'module'` are NOT atlas concepts — the repo defines them.
export const partOfFor = (category: string, capture: string): PartOfForDescriptor => ({
  __atlasPartOfFor: true,
  category,
  capture,
});

export const isPartOfFor = (v: unknown): v is PartOfForDescriptor => {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Partial<PartOfForDescriptor>;
  return d.__atlasPartOfFor === true && typeof d.category === 'string' && typeof d.capture === 'string';
};

// A tag value is a literal string (with optional `$n` interpolation), a list of
// those, or a lazy partOfFor descriptor.
export type TagValue = string | string[] | PartOfForDescriptor;

export type StampRule = {
  include: string | string[];
  kind?: TagValue;
  partOf?: TagValue;
  constructs?: TagValue;
  // @uses is NEVER auto-stamped — absence is a signal (uncurated), so atlas
  // leaves it out entirely. There is intentionally no `uses` field here.
};

// field name (e.g. 'docs') → a value's repo-relative path, so
// `atlas check` can verify the reference exists on disk.
export type ReferenceResolver = (value: string) => string;

// The defaultable fields, defined once so input (all optional) and loaded (all
// present) stay in lockstep — adding a field can't drift between the two.
type ConfigDefaults = {
  stamp: StampRule[]; // path → tag rules
  ignore: string[]; // files exempt from presence + stamping (tests, barrels)
  include: string[]; // file globs atlas considers (default: common source files)
  references: Record<string, ReferenceResolver>;
};

export type AtlasConfigInput = Partial<ConfigDefaults>;

export const defineConfig = (config: AtlasConfigInput): AtlasConfigInput => config;

// What the loader hands the engine once defaults are applied and vocab/registry
// are loaded from the sibling .atlas/ files.
export type LoadedConfig = ConfigDefaults & {
  kinds: readonly string[];
  concepts: ConceptRegistry;
};
