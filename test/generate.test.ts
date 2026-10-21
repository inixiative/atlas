import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { generate } from '../src/commands/generate.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');
const HOOKS = resolve(import.meta.dir, 'fixtures/hooks');

describe('generate (MAP.md)', () => {
  test('groups concepts by class with file lists and a kind breakdown', async () => {
    const map = generate(await analyze(MINI));
    expect(map.startsWith('# MAP')).toBe(true);
    expect(map).toContain('## feature');
    expect(map).toContain('### feature:billing');
    expect(map).toContain('src/modules/billing/controllers/createInvoice.ts');
    expect(map).toContain('controller(1)');
    expect(map).toContain('## infrastructure');
    expect(map).toContain('### infrastructure:redis');
  });

  test('lists @uses consumers under the concept they depend on', async () => {
    const map = generate(await analyze(MINI));
    const redisSection = map.slice(map.indexOf('### infrastructure:redis'));
    expect(redisSection).toContain('src/modules/billing/services/charge.ts');
  });

  test('counts a kind that shares a name with an Object.prototype key', async () => {
    const map = generate(await analyze(HOOKS));
    expect(map).toContain('constructor(1)');
    expect(map).not.toContain('[native code]');
  });

  test('is deterministic — identical input yields byte-identical output', async () => {
    const a = await analyze(MINI);
    expect(generate(a)).toBe(generate(a));
  });
});
