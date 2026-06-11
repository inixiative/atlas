import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { type Coverage, coverage, evaluateCoverageGate } from '../src/commands/coverage.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

const snapshot = (annotated: number, total: number): Coverage => ({
  total,
  annotated,
  unannotated: Array.from({ length: total - annotated }, (_, i) => `f${i}.ts`),
  uses: { uncurated: [], curatedEmpty: [], proposed: [], curated: [] },
  unresolved: [],
});

describe('evaluateCoverageGate', () => {
  test('--min is a percentage floor (inclusive)', () => {
    expect(evaluateCoverageGate(snapshot(4, 5), { min: 90 }).ok).toBe(false); // 80% < 90%
    expect(evaluateCoverageGate(snapshot(4, 5), { min: 80 }).ok).toBe(true); // 80% >= 80%
    expect(evaluateCoverageGate(snapshot(4, 5), { min: 50 }).ok).toBe(true);
  });

  test('ratchet fails when unannotated count exceeds the baseline, passes otherwise', () => {
    expect(evaluateCoverageGate(snapshot(4, 5), { ratchet: 1 }).ok).toBe(true); // 1 unannotated == baseline
    expect(evaluateCoverageGate(snapshot(3, 5), { ratchet: 1 }).ok).toBe(false); // 2 unannotated > baseline 1
    expect(evaluateCoverageGate(snapshot(5, 5), { ratchet: 1 }).ok).toBe(true); // improved to 0
  });

  test('an empty repo is 100% and passes any gate', () => {
    expect(evaluateCoverageGate(snapshot(0, 0), { min: 100, ratchet: 0 }).ok).toBe(true);
  });
});

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
