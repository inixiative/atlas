// atlas default `@concern` vocabulary — cross-cutting PROPERTIES.
//
// Concerns are not role (@kind), not membership (@partOf), not dependency
// (@uses). They are the fourth axis, and they are the point of the graph:
// meaning emerges from the INTERSECTION of edges. "The thing that redacts user
// PII for retention" is not a bespoke tag — it's
//   @kind handler @partOf feature:users @concern pii, retention
// converging. Prefer multiple broad-true concern tags over one narrow one.
//
// Closed set, but the consumer EXTENDS it:
//   export const CONCERNS = [...DEFAULT_CONCERNS, 'gdpr'] as const
//
// Discipline: broad but CLOSED vocab, applied LIBERALLY — but every concern
// must be genuinely true and load-bearing for the file.

export const DEFAULT_CONCERNS = [
  'pii', // handles personally-identifying data (redaction, anonymization, export)
  'security', // a security boundary / sensitive surface (authz, signing, untrusted input)
  'secrets', // handles secrets / encryption-at-rest / key material
  'money', // billing, payments, entitlements with cost implications
  'tenantIsolation', // enforces or depends on org/space data isolation
  'retention', // data lifecycle: retention, archival, deletion, erase
  'idempotency', // must be safe to run more than once (jobs, reconcilers, webhooks)
  'hotPath', // performance-sensitive (per-request, high-frequency)
  'publicSurface', // reachable unauthenticated / externally exposed
  'audit', // produces or depends on the audit trail
] as const;

export type DefaultConcern = (typeof DEFAULT_CONCERNS)[number];
