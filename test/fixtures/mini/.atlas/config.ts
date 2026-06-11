import { defineConfig, partOfFor } from '@inixiative/atlas/config';

export default defineConfig({
  include: ['src/**/*.ts'],
  ignore: ['**/*.test.ts', '**/index.ts'],
  stamp: [
    { include: '**/controllers/**', kind: 'controller' },
    { include: '**/services/**', kind: 'service' },
    { include: 'src/jobs/**', kind: 'job' },
    { include: 'src/modules/$1/**', partOf: partOfFor('module', '$1') },
  ],
  references: {
    docs: (v) => `docs/${v}`,
  },
});
