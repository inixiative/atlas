import type { SeamRegistry } from '@inixiative/atlas';

// Repo-OWNED registry. The consumer defines its seam classes (feature/primitive/
// infrastructure) and its constituent category (`module`) — none of which atlas
// hardcodes. Structure only: references (docs/tickets) + constituents (module).
export const SEAMS: SeamRegistry = {
  'feature:billing': { module: ['billing'], docs: ['BILLING.md'], tickets: ['FEAT-100'] },
  'primitive:email': { module: ['email'], docs: ['EMAIL.md'] },
  'primitive:authz': {},
  'infrastructure:redis': {},
};
