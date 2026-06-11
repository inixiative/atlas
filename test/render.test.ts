import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { buildCoverageReport, type CoverageReport, buildConceptGraph, type ConceptGraph } from '../src/commands/report.ts';
import { renderCoverageHtml } from '../src/render/html.ts';
import { renderCoverageMarkdown, safeId } from '../src/render/markdown.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

const emptyReport: CoverageReport = {
  total: {
    files: 0,
    missingBlock: 0,
    missingKind: 0,
    missingPartOf: 0,
    usesUncurated: 0,
    usesCuratedEmpty: 0,
    usesCurated: 0,
    usesProposed: 0,
  },
  categories: [],
  filesInMultipleConcepts: 0,
};

describe('mermaid safety', () => {
  test('safeId is injective — concept ids differing only by a special char do not collide', () => {
    expect(safeId('feature:billing')).not.toBe(safeId('feature.billing'));
  });

  test('a quote in a concept id is escaped in the mermaid label (no diagram break / injection)', () => {
    const graph: ConceptGraph = { nodes: [{ id: 'feature:a"x', cls: 'feature', label: 'a"x' }], edges: [] };
    const md = renderCoverageMarkdown(emptyReport, graph);
    expect(md).toContain('&quot;');
    expect(md).not.toContain('a"x"]'); // raw quote would break the node label
  });
});

describe('renderCoverageMarkdown', () => {
  test('emits totals, a mermaid pie, a by-category table, and a mermaid concept graph', async () => {
    const a = await analyze(MINI);
    const md = renderCoverageMarkdown(buildCoverageReport(a), buildConceptGraph(a));
    expect(md.startsWith('# Coverage')).toBe(true);
    expect(md).toContain('pie title');
    expect(md).toContain('| feature:billing |');
    expect(md).toContain('graph LR');
    expect(md).toContain('feature_58_billing --> primitive_58_authz'); // injective sanitized edge (':' → _58_)
  });

  test('is deterministic', async () => {
    const a = await analyze(MINI);
    const r = buildCoverageReport(a);
    const g = buildConceptGraph(a);
    expect(renderCoverageMarkdown(r, g)).toBe(renderCoverageMarkdown(r, g));
  });
});

describe('renderCoverageHtml', () => {
  test('is a self-contained Cytoscape page with the graph + coverage embedded as JSON', async () => {
    const a = await analyze(MINI);
    const html = renderCoverageHtml(buildCoverageReport(a), buildConceptGraph(a));
    expect(html.toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(html.toLowerCase()).toContain('cytoscape');

    const m = html.match(/<script id="atlas-data" type="application\/json">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const data = JSON.parse(m![1]!);
    expect(data.graph.nodes.length).toBe(4);
    expect(data.report.total.files).toBe(5);
  });

  test('uses Cytoscape-parseable colours (comma-form hsl, no 4-digit alpha hex)', async () => {
    const a = await analyze(MINI);
    const html = renderCoverageHtml(buildCoverageReport(a), buildConceptGraph(a));
    expect(html).toContain(', 65%, 45%)'); // comma-form hsl Cytoscape accepts
    expect(html).not.toContain(' 65% 45%)'); // the space-separated form it rejects → grey nodes
    expect(html).not.toMatch(/#[0-9a-fA-F]{4}\b/); // no 4-digit alpha hex (Cytoscape can't parse it)
  });

  test('escapes < in embedded JSON so a concept id cannot break out of the script tag', () => {
    const graph: ConceptGraph = { nodes: [{ id: 'feature:</script>', cls: 'feature', label: 'x' }], edges: [] };
    const html = renderCoverageHtml(emptyReport, graph);
    const body = html.slice(html.indexOf('atlas-data'));
    expect(body).not.toContain('</script>x'); // the injected close tag must be escaped
    expect(html).toContain('\\u003c');
  });
});
