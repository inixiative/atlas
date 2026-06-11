import { defineConfig, partOfFor } from '@inixiative/atlas/config';

export default defineConfig({
  // Files atlas considers (everything else is invisible to it).
  include: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts'],

  // Files exempt from the presence check and from stamping (barrels, tests, generated).
  ignore: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**', '**/index.ts', '**/*.d.ts', '**/*.gen.ts'],

  // Stamp rules COMPOSE (not first-match-wins) — every matching rule contributes.
  // `@uses` is never auto-stamped (its absence is a signal), so there are no @uses rules.
  stamp: [
    // @kind from structural globs (no capture). Rules compose, so a file can pick
    // up several — e.g. a file in components/ AND matching *.types.ts.
    { include: '**/controllers/**', kind: 'controller' },
    { include: 'apps/api/**/routes/**', kind: 'route' }, // backend HTTP routes
    { include: '**/services/**', kind: 'service' },
    { include: '**/queries/**', kind: 'query' },
    { include: '**/schemas/**', kind: 'schema' },
    { include: '**/handlers/**', kind: 'handler' },
    { include: '**/jobs/**', kind: 'job' },
    { include: ['**/constants/**', '**/constants.ts'], kind: 'constant' },
    { include: ['**/utils/**', '**/utils.ts'], kind: 'utils' },
    { include: ['**/types/**', '**/*.types.ts'], kind: 'type' },
    { include: '**/factories/**', kind: 'factory' },
    { include: ['**/client.ts', '**/*.client.ts'], kind: 'client' },
    { include: '**/*.config.ts', kind: 'config' },
    { include: ['**/seed.ts', '**/*.seed.ts', '**/seeds/**'], kind: 'seed' },
    // frontend (UI library + apps): components, hooks, file-based routes (pages), stores, bootstrap
    { include: '**/components/**', kind: 'component' },
    { include: ['packages/ui/**/hooks/**', 'apps/*/**/hooks/**'], kind: 'hook' }, // React hooks (not api db-hooks)
    { include: ['apps/*/**/routes/**'], kind: 'page' }, // TanStack file-based routes are pages
    { include: ['**/store/**', '**/*.store.ts'], kind: 'store' },
    { include: ['apps/*/app/main.tsx', 'apps/*/app/client.tsx', 'apps/*/app/router.tsx'], kind: 'entrypoint' },

    // @partOf from a captured path segment, resolved through your constituent
    // categories in concepts.ts. `$1` captures one segment; `partOfFor('module', '$1')`
    // looks the captured folder up across every concept's `module` list (→ multi-@partOf).
    { include: 'apps/api/src/modules/$1/**', partOf: partOfFor('module', '$1') },
    { include: 'apps/api/src/integrations/$1/**', partOf: partOfFor('integration', '$1') },
    { include: 'packages/$1/**', partOf: partOfFor('package', '$1') },
  ],

  // Resolve a reference field's value to a repo-relative path so `atlas check`
  // can verify it exists. Keep references in-repo and stable (docs), not
  // fast-moving external IDs that rot.
  references: {
    docs: (v) => `docs/${v}`,
  },
});
