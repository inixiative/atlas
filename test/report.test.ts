import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { buildCoverageReport, buildConceptGraph } from '../src/commands/report.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

describe('buildCoverageReport', () => {
  test('totals split required gaps from @uses curation buckets', async () => {
    const { total } = buildCoverageReport(await analyze(MINI));
    expect(total.files).toBe(5);
    expect(total.missingBlock).toBe(1); // legacy.ts
    expect(total.missingKind).toBe(0);
    expect(total.missingPartOf).toBe(0);
    expect(total.usesUncurated).toBe(1); // util.ts
    expect(total.usesCuratedEmpty).toBe(1); // sendEmail.ts (@uses none)
    expect(total.usesCurated).toBe(2); // createInvoice, charge
  });

  test('groups by effective concept (actual @partOf, else predicted), with an (unmapped) bucket', async () => {
    const { categories } = buildCoverageReport(await analyze(MINI));
    const by = Object.fromEntries(categories.map((c) => [c.category, c]));
    expect(by['feature:billing']?.files).toBe(3);
    expect(by['feature:billing']?.usesUncurated).toBe(1);
    expect(by['primitive:email']?.usesCuratedEmpty).toBe(1);
    expect(by['(unmapped)']?.missingBlock).toBe(1); // legacy.ts has no rule-predicted concept
  });

  test('reports filesInMultipleConcepts so category sums exceeding the total are explained', async () => {
    const report = buildCoverageReport({
      root: '/x',
      config: { kinds: [], concepts: { 'feature:a': {}, 'feature:b': {} }, stamp: [], ignore: [], include: [], references: {} },
      files: [
        {
          path: 'x.ts',
          annotation: {
            kind: ['service'],
            partOf: ['feature:a', 'feature:b'],
            uses: [],
            usesState: 'absent',
            constructs: [],
            pinned: false,
            axes: {},
          },
        },
      ],
    });
    expect(report.total.files).toBe(1);
    expect(report.filesInMultipleConcepts).toBe(1); // the one file is counted in both feature:a and feature:b
  });
});

describe('buildConceptGraph', () => {
  test('nodes are registry concepts; edges are partOf→uses aggregated from files', async () => {
    const g = buildConceptGraph(await analyze(MINI));
    expect(g.nodes.map((n) => n.id).sort()).toEqual([
      'feature:billing',
      'infrastructure:redis',
      'primitive:authz',
      'primitive:email',
    ]);
    expect(g.edges).toContainEqual({ source: 'feature:billing', target: 'primitive:authz' });
    expect(g.edges).toContainEqual({ source: 'feature:billing', target: 'infrastructure:redis' });
    expect(g.edges.length).toBe(2); // sendEmail @uses none → no edge
  });

  test('nodes carry their class for grouping', async () => {
    const g = buildConceptGraph(await analyze(MINI));
    expect(g.nodes.find((n) => n.id === 'feature:billing')?.cls).toBe('feature');
  });
});
