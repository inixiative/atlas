import type { SeamRegistry } from '@inixiative/atlas';

// The seam registry — the single source of valid seams, repo-OWNED, STRUCTURE
// ONLY (no status, no notes — those rot). Keyed `class:name`; the class prefix
// (feature / primitive / infrastructure / registry) is your choice, derived
// from these keys, not hardcoded by atlas.
//
// Each entry is a bag of named string lists you define:
//   - reference fields (docs, tickets) — where to read about the seam; checked
//     for existence by `atlas check` if you wire a resolver in config.ts, and
//     invertible (ticket → seams, doc → seams).
//   - constituent fields (module, package, integration) — the code that COMPOSES
//     the seam. These fill @partOf during `atlas stamp` via partOfFor(...).
//
// A module/package routinely belongs to several seams — multi-@partOf is normal.
export const SEAMS: SeamRegistry = {
  // ── features (user-facing capabilities) ───────────────────────────────────
  'feature:tenancy': { module: ['organization', 'space', 'membership'], docs: ['AUTH.md'], tickets: ['AUTH-002'] },
  'feature:billing': { module: ['billing', 'invoicing'], docs: ['BILLING.md'] },
  'feature:users': { module: ['user', 'profile'] },
  'feature:email': { package: ['email'], integration: ['sendgrid'], docs: ['COMMUNICATIONS.md'] },

  // ── primitives (reusable building blocks features are made of) ─────────────
  'primitive:authz': { package: ['permissions'], docs: ['PERMISSIONS.md'] },
  'primitive:caching': { module: ['cache'], docs: ['REDIS.md'] },
  'primitive:jobs': { module: ['jobs'], docs: ['JOBS.md'] },

  // ── infrastructure (external dependencies consumed via @uses) ──────────────
  'infrastructure:postgres': { package: ['db'], docs: ['DATABASE.md'] },
  'infrastructure:redis': { docs: ['REDIS.md'] },
  'infrastructure:s3': {},

  // ── registries (the registry pattern — a config table that drives behavior) ─
  'registry:featureFlags': { module: ['flags'] },
};
