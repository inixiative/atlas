import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { partOfFor } from '../src/config/defineConfig.ts';
import type { LoadedConfig } from '../src/config/defineConfig.ts';
import { planStamp, runStamp } from '../src/commands/stamp.ts';
import { parseAtlasBlock } from '../src/parse/parseAtlasBlock.ts';

const config: LoadedConfig = {
  kinds: [],
  seams: { 'feature:billing': { module: ['billing'] } },
  stamp: [
    { include: '**/controllers/**', kind: 'controller' },
    { include: 'src/modules/$1/**', partOf: partOfFor('module', '$1') },
  ],
  ignore: [],
  include: ['src/**/*.ts'],
  references: {},
};

const files = [
  { path: 'src/modules/billing/controllers/create.ts', source: 'export const x = 1;\n' },
  { path: 'src/modules/billing/services/charge.ts', source: '/**\n * @atlas\n * @kind service\n */\nx;\n' },
];

describe('planStamp', () => {
  test('plans a new block for an unannotated file and an additive fill for an annotated one', () => {
    const plan = planStamp(files, config, 'additive');
    expect(plan.length).toBe(2);
    const create = plan.find((c) => c.path.endsWith('create.ts'));
    expect(parseAtlasBlock(create!.after)?.kind).toEqual(['controller']);
    expect(parseAtlasBlock(create!.after)?.partOf).toEqual(['feature:billing']);
    const charge = plan.find((c) => c.path.endsWith('charge.ts'));
    expect(parseAtlasBlock(charge!.after)?.kind).toEqual(['service']); // preserved
    expect(parseAtlasBlock(charge!.after)?.partOf).toEqual(['feature:billing']); // added
  });

  test('targeting scopes the plan to a folder', () => {
    const plan = planStamp(files, config, 'additive', 'src/modules/billing/services');
    expect(plan.map((c) => c.path)).toEqual(['src/modules/billing/services/charge.ts']);
  });

  test('is idempotent — re-planning already-stamped sources yields no changes', () => {
    const stamped = planStamp(files, config, 'additive').map((c) => ({ path: c.path, source: c.after }));
    // the untouched file (none here) plus restamped sources → nothing left to do
    expect(planStamp(stamped, config, 'additive').length).toBe(0);
  });
});

describe('runStamp (write to disk)', () => {
  test('--write persists the planned changes; dry-run leaves files untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-stamp-'));
    try {
      const file = 'src/modules/billing/controllers/create.ts';
      await Bun.write(resolve(dir, file), 'export const x = 1;\n');
      // write a minimal .atlas so loadConfig finds the rules
      await Bun.write(
        resolve(dir, '.atlas/seams.ts'),
        "export const SEAMS = { 'feature:billing': { module: ['billing'] } };\n",
      );
      await Bun.write(
        resolve(dir, '.atlas/config.ts'),
        "export default { include: ['src/**/*.ts'], stamp: [{ include: '**/controllers/**', kind: 'controller' }] };\n",
      );

      const dry = await runStamp(dir, { mode: 'additive', write: false });
      expect(dry.changes.length).toBe(1);
      expect(await Bun.file(resolve(dir, file)).text()).toBe('export const x = 1;\n'); // untouched

      const written = await runStamp(dir, { mode: 'additive', write: true });
      expect(written.changes.length).toBe(1);
      expect(parseAtlasBlock(await Bun.file(resolve(dir, file)).text())?.kind).toEqual(['controller']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('surfaces unresolved memberships (a partOf capture matching no seam)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-unres-'));
    try {
      await Bun.write(resolve(dir, 'src/modules/ghost/x.ts'), 'export const x = 1;\n');
      await Bun.write(resolve(dir, '.atlas/seams.ts'), "export const SEAMS = { 'feature:real': { module: ['real'] } };\n");
      await Bun.write(
        resolve(dir, '.atlas/config.ts'),
        "export default { include: ['src/**/*.ts'], stamp: [{ include: 'src/modules/$1/**', partOf: { __atlasPartOfFor: true, category: 'module', capture: '$1' } }] };\n",
      );
      const { unresolved } = await runStamp(dir, { mode: 'additive', write: false });
      expect(unresolved).toEqual([{ file: 'src/modules/ghost/x.ts', category: 'module', value: 'ghost' }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
