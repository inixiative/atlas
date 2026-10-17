import type { Thesaurus } from '@inixiative/atlas';

// The thesaurus — optional. The words and phrases people search with, mapped to the concept
// ids they mean, so `atlas hook grep` lands on "send an email" or "cache" even though no
// concept is named that. Matching is case-insensitive, on whole words or phrases.
//
// Upkeep: when a search misses and you later find the thing, add the words you searched
// with. Entries come from how people describe the job, never from a test's expected answer.
export const THESAURUS: Thesaurus = {
  'send an email': ['feature:email'],
  invoice: ['feature:billing'],
  'feature flag': ['feature:featureFlags'],
  permission: ['primitive:authz'],
  memoize: ['primitive:caching'],
  'background job': ['primitive:jobs'],
  queue: ['primitive:jobs'],
};
