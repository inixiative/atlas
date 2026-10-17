import type { Thesaurus } from '@inixiative/atlas';

// The thesaurus — optional, keyed by concept. Each concept lists the phrases people search
// with when they mean it, so `atlas hook grep` lands on it for "send an email" or "queue"
// even though no concept is named that, and points the agent at where to read.
//
// `doc` is a `docs:` value as concepts.ts writes it (run through `references.docs`) plus an
// optional `#section`. Leave it out to use the concept's first `docs:` entry.
// Write phrases in their base form: "lock" also matches locks, locking, locked.
//
// Upkeep: when a search misses and you later find the thing, add the words you searched
// with to that concept's phrases. Phrases come from how people describe the job, never from
// a test's expected answer.
export const THESAURUS: Thesaurus = {
  'feature:email': { phrases: ['send an email', 'mail'], doc: 'COMMUNICATIONS.md#sending' },
  'feature:billing': { phrases: ['invoice', 'charge a customer'] },
  'feature:featureFlags': { phrases: ['feature flag', 'toggle'] },
  'primitive:authz': { phrases: ['permission', 'authorize'] },
  'primitive:caching': { phrases: ['memoize', 'cache'] },
  'primitive:jobs': { phrases: ['background job', 'queue', 'schedule'] },
};
