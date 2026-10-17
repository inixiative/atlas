// Public API — what a consuming repo's `.atlas/` config imports.

export type { Graph } from './commands/graph.ts';
export {
  atlasHookEntry,
  CLAUDE_SETTINGS,
  hookCommandFor,
  mergeAtlasHooks,
  type SetupReport,
  setupClaudeHooks,
} from './commands/setup.ts';
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
export { type CachedGraphOptions, cachedGraph, GRAPH_CACHE_TTL_MS } from './hook/cachedGraph.ts';
export {
  HOOK_EVENTS,
  type HookEvent,
  runClaudeCodeHook,
  toAdditionalContext,
} from './hook/claudeCode.ts';
export {
  type AtlasLocation,
  findAtlasRoot,
  identifierToken,
  REACH_KINDS,
  renderConceptMatches,
  renderNeighbourhood,
} from './hook/neighbourhood.ts';
export { type AtlasAnnotation, parseAtlasBlock, type UsesState } from './parse/parseAtlasBlock.ts';
export { invert } from './registry/invert.ts';
export {
  type ConceptEntry,
  type ConceptRegistry,
  conceptClass,
  conceptClasses,
  type Thesaurus,
} from './registry/types.ts';
export { DEFAULT_KINDS, type DefaultKind } from './vocab/kinds.ts';
