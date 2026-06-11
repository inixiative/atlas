import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { graph } from '../src/commands/graph.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');
const CONTROLLER = 'src/modules/billing/controllers/createInvoice.ts';
const SERVICE = 'src/modules/billing/services/charge.ts';
const UTIL = 'src/lib/util.ts';

describe('graph', () => {
  test('indexes concept → files via @partOf', async () => {
    const g = graph(await analyze(MINI));
    expect(g.conceptToFiles['feature:billing']).toEqual([UTIL, CONTROLLER, SERVICE]); // sorted
    expect(g.conceptToFiles['primitive:email']).toEqual(['src/jobs/sendEmail.ts']);
  });

  test('indexes concept → consumers via @uses', async () => {
    const g = graph(await analyze(MINI));
    expect(g.usesConsumers['infrastructure:redis']).toEqual([SERVICE]);
    expect(g.usesConsumers['primitive:authz']).toEqual([CONTROLLER]);
  });

  test('indexes file → its concepts', async () => {
    const g = graph(await analyze(MINI));
    expect(g.fileToConcepts[SERVICE]).toEqual({ partOf: ['feature:billing'], uses: ['infrastructure:redis'] });
  });

  test('inverts reference fields: ticket → concepts and doc → concepts', async () => {
    const g = graph(await analyze(MINI));
    expect(g.ticketToConcepts['FEAT-100']).toEqual(['feature:billing']);
    expect(g.docToConcepts['EMAIL.md']).toEqual(['primitive:email']);
  });
});
