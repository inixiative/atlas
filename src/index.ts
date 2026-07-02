// Public API — what a consuming repo's `.atlas/` config imports.

export {
  type AtlasConfigInput,
  defineConfig,
  isPartOfFor,
  type LoadedConfig,
  type PartOfForDescriptor,
  partOfFor,
  type ReferenceResolver,
  type StampRule,
  type TagValue,
} from './config/defineConfig.ts';
export { type AtlasAnnotation, parseAtlasBlock, type UsesState } from './parse/parseAtlasBlock.ts';
export { invert } from './registry/invert.ts';
export {
  type ConceptEntry,
  type ConceptRegistry,
  conceptClass,
  conceptClasses,
} from './registry/types.ts';
export { DEFAULT_KINDS, type DefaultKind } from './vocab/kinds.ts';
