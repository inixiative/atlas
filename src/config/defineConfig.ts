import type { SeamRegistry } from '../registry/types.ts';

// `partOfFor` is a LAZY descriptor, not a value. The consumer's config.ts can
// reference it before the seam registry is loaded; the stamp engine resolves it
// later against the loaded registry. This is what lets `.atlas/config.ts` and
// `.atlas/seams.ts` be separate files with no evaluation-order coupling.
export type PartOfForDescriptor = { __atlasPartOfFor: true; category: string; capture: string };

// Fill @partOf by resolving a captured path segment through the inverse of a
// consumer-defined constituent category:  partOfFor('module', '$1').
// `category` and `'module'` are NOT atlas concepts — the repo defines them.
export const partOfFor = (category: string, capture: string): PartOfForDescriptor => ({
  __atlasPartOfFor: true,
  category,
  capture,
});

export const isPartOfFor = (v: unknown): v is PartOfForDescriptor =>
  typeof v === 'object' && v !== null && (v as PartOfForDescriptor).__atlasPartOfFor === true;

// A tag value is a literal string (with optional `$n` interpolation), a list of
// those, or a lazy partOfFor descriptor.
export type TagValue = string | string[] | PartOfForDescriptor;

export type StampRule = {
  include: string | string[];
  kind?: TagValue;
  partOf?: TagValue;
  concern?: TagValue;
  constructs?: TagValue;
  // @uses is NEVER auto-stamped — absence is a signal (uncurated), so atlas
  // leaves it out entirely. There is intentionally no `uses` field here.
};

// field name (e.g. 'docs', 'tickets') → a value's repo-relative path, so
// `atlas check` can verify the reference exists on disk.
export type ReferenceResolver = (value: string) => string;

export type AtlasConfigInput = {
  stamp?: StampRule[];
  ignore?: string[]; // files exempt from presence + stamping (tests, barrels)
  include?: string[]; // file globs atlas considers (default: common source files)
  references?: Record<string, ReferenceResolver>;
};

export const defineConfig = (config: AtlasConfigInput): AtlasConfigInput => config;

// What the loader hands the engine once defaults are applied and vocab/registry
// are loaded from the sibling .atlas/ files.
export type LoadedConfig = {
  kinds: readonly string[];
  concerns: readonly string[];
  seams: SeamRegistry;
  stamp: StampRule[];
  ignore: string[];
  include: string[];
  references: Record<string, ReferenceResolver>;
};
