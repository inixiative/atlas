import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { buildCoverageReport, buildSeamGraph } from '../src/commands/report.ts';
import { renderCoverageHtml } from '../src/render/html.ts';
import { renderCoverageMarkdown } from '../src/render/markdown.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

describe('renderCoverageMarkdown', () => {
  test('emits totals, a mermaid pie, a by-category table, and a mermaid seam graph', async () => {
    const a = await analyze(MINI);
    const md = renderCoverageMarkdown(buildCoverageReport(a), buildSeamGraph(a));
    expect(md.startsWith('# Coverage')).toBe(true);
    expect(md).toContain('pie title');
    expect(md).toContain('| feature:billing |');
    expect(md).toContain('graph LR');
    expect(md).toContain('feature_billing --> primitive_authz'); // sanitized edge
  });

  test('is deterministic', async () => {
    const a = await analyze(MINI);
    const r = buildCoverageReport(a);
    const g = buildSeamGraph(a);
    expect(renderCoverageMarkdown(r, g)).toBe(renderCoverageMarkdown(r, g));
  });
});

describe('renderCoverageHtml', () => {
  test('is a self-contained Cytoscape page with the graph + coverage embedded as JSON', async () => {
    const a = await analyze(MINI);
    const html = renderCoverageHtml(buildCoverageReport(a), buildSeamGraph(a));
    expect(html.toLowerCase().startsWith('<!doctype html>')).toBe(true);
    expect(html.toLowerCase()).toContain('cytoscape');

    const m = html.match(/<script id="atlas-data" type="application\/json">([\s\S]*?)<\/script>/);
    expect(m).not.toBeNull();
    const data = JSON.parse(m![1]!);
    expect(data.graph.nodes.length).toBe(4);
    expect(data.report.total.files).toBe(5);
  });
});
