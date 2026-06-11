import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { coverage } from '../src/commands/coverage.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

describe('coverage', () => {
  test('separates unannotated files and the @uses curation buckets', async () => {
    const c = coverage(await analyze(MINI));
    expect(c.total).toBe(5);
    expect(c.unannotated).toEqual(['src/lib/legacy.ts']);
    expect(c.uses.uncurated).toEqual(['src/lib/util.ts']);
    expect(c.uses.curatedEmpty).toEqual(['src/jobs/sendEmail.ts']);
    expect(c.uses.curated.sort()).toEqual([
      'src/modules/billing/controllers/createInvoice.ts',
      'src/modules/billing/services/charge.ts',
    ]);
    expect(c.uses.proposed).toEqual([]);
  });

  test('reports no unresolved captures when every membership resolves', async () => {
    expect(coverage(await analyze(MINI)).unresolved).toEqual([]);
  });
});
