import { defineConfig, partOfFor } from '@inixiative/atlas/config';

export default defineConfig({
  // Files atlas considers (everything else is invisible to it).
  include: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts'],

  // Files exempt from the presence check and from stamping (barrels, tests, generated).
  ignore: ['**/*.test.ts', '**/*.test.tsx', '**/tests/**', '**/index.ts', '**/*.d.ts', '**/*.gen.ts'],

  // Stamp rules COMPOSE (not first-match-wins) — every matching rule contributes.
  // `@uses` is never auto-stamped (its absence is a signal), so there are no @uses rules.
  stamp: [
    // @kind from structural globs (no capture):
    { include: '**/controllers/**', kind: 'controller' },
    { include: '**/routes/**', kind: 'route' },
    { include: '**/services/**', kind: 'service' },
    { include: '**/schemas/**', kind: 'schema' },
    { include: '**/handlers/**', kind: 'handler' },
    { include: '**/jobs/**', kind: 'job' },

    // @partOf from a captured path segment, resolved through your constituent
    // categories in seams.ts. `$1` captures one segment; `partOfFor('module', '$1')`
    // looks the captured folder up across every seam's `module` list (→ multi-@partOf).
    { include: 'apps/api/src/modules/$1/**', partOf: partOfFor('module', '$1') },
    { include: 'apps/api/src/integrations/$1/**', partOf: partOfFor('integration', '$1') },
    { include: 'packages/$1/**', partOf: partOfFor('package', '$1') },
  ],

  // Resolve a reference field's value to a repo-relative path so `atlas check`
  // can verify it exists. Only fields with a resolver here are existence-checked;
  // others (e.g. tickets with slugged filenames) are kept for invert() only.
  references: {
    docs: (v) => `docs/${v}`,
  },
});
