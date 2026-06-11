import type { ConceptRegistry } from '@inixiative/atlas';

// Repo-OWNED registry. The consumer defines its concept classes (feature/primitive/
// infrastructure) and its constituent category (`module`) — none of which atlas
// hardcodes. Structure only: references (docs) + constituents (module).
export const CONCEPTS: ConceptRegistry = {
  'feature:billing': { module: ['billing'], docs: ['BILLING.md'] },
  'primitive:email': { module: ['email'], docs: ['EMAIL.md'] },
  'primitive:authz': {},
  'infrastructure:redis': {},
};
