import { defineConfig } from '@inixiative/atlas/config';

export default defineConfig({
  include: ['src/**/*.ts'],
  references: { docs: (v) => `docs/${v}` },
});
