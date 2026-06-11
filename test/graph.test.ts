import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { graph } from '../src/commands/graph.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');
const CONTROLLER = 'src/modules/billing/controllers/createInvoice.ts';
const SERVICE = 'src/modules/billing/services/charge.ts';
const UTIL = 'src/lib/util.ts';

describe('graph', () => {
  test('indexes seam → files via @partOf', async () => {
    const g = graph(await analyze(MINI));
    expect(g.seamToFiles['feature:billing']).toEqual([UTIL, CONTROLLER, SERVICE]); // sorted
    expect(g.seamToFiles['primitive:email']).toEqual(['src/jobs/sendEmail.ts']);
  });

  test('indexes seam → consumers via @uses', async () => {
    const g = graph(await analyze(MINI));
    expect(g.usesConsumers['infrastructure:redis']).toEqual([SERVICE]);
    expect(g.usesConsumers['primitive:authz']).toEqual([CONTROLLER]);
  });

  test('indexes file → its seams', async () => {
    const g = graph(await analyze(MINI));
    expect(g.fileToSeams[SERVICE]).toEqual({ partOf: ['feature:billing'], uses: ['infrastructure:redis'] });
  });

  test('inverts reference fields: ticket → seams and doc → seams', async () => {
    const g = graph(await analyze(MINI));
    expect(g.ticketToSeams['FEAT-100']).toEqual(['feature:billing']);
    expect(g.docToSeams['EMAIL.md']).toEqual(['primitive:email']);
  });
});
