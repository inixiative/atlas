import type { CoverageReport, SeamGraph } from '../commands/report.ts';

// JSON embedded in a <script> tag must not contain a literal </script> or a
// raw '<'; escaping '<' is sufficient and keeps it valid JSON.
const embed = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

// A self-contained interactive report: Cytoscape (via CDN) renders the seam
// graph with compound nodes grouping seams by class (the grouping view), node
// colour = block coverage, tap a node to drill into its files, tap to highlight
// neighbours (traverse). No build step — open the file in a browser.
export const renderCoverageHtml = (report: CoverageReport, graph: SeamGraph): string => {
  const data = embed({ report, graph });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>atlas — coverage & seam graph</title>
<script src="https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js"></script>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; display: flex; height: 100vh; }
  #cy { flex: 1; height: 100%; }
  #panel { width: 340px; border-left: 1px solid #8884; padding: 16px; overflow: auto; }
  #panel h1 { font-size: 15px; margin: 0 0 4px; }
  #panel .sub { opacity: .6; margin: 0 0 16px; font-size: 12px; }
  .bar { height: 8px; border-radius: 4px; background: #8883; overflow: hidden; margin: 6px 0 14px; }
  .bar > i { display: block; height: 100%; background: #2e9e54; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td { padding: 2px 0; } td.n { text-align: right; font-variant-numeric: tabular-nums; }
  ul.files { list-style: none; padding: 0; margin: 8px 0 0; font-size: 12px; }
  ul.files li { padding: 2px 0; border-bottom: 1px solid #8882; word-break: break-all; }
  .hint { opacity: .55; font-size: 12px; }
</style>
</head>
<body>
<div id="cy"></div>
<div id="panel"><h1>atlas</h1><p class="sub">click a seam to drill in · click again to traverse</p><p class="hint">Loading…</p></div>
<script id="atlas-data" type="application/json">${data}</script>
<script>
  const { report, graph } = JSON.parse(document.getElementById('atlas-data').textContent);
  const byCat = Object.fromEntries(report.categories.map((c) => [c.category, c]));
  const cov = (id) => { const c = byCat[id]; return c && c.files ? (c.files - c.missingBlock) / c.files : 0; };
  const color = (r) => 'hsl(' + Math.round(r * 120) + ' 65% 45%)'; // red→green

  const classes = [...new Set(graph.nodes.map((n) => n.cls))];
  const elements = [
    ...classes.map((cls) => ({ data: { id: 'cls:' + cls, label: cls }, classes: 'group' })),
    ...graph.nodes.map((n) => ({ data: { id: n.id, parent: 'cls:' + n.cls, label: n.label, cov: cov(n.id) } })),
    ...graph.edges.map((e) => ({ data: { id: e.source + '->' + e.target, source: e.source, target: e.target } })),
  ];

  const cy = cytoscape({
    container: document.getElementById('cy'),
    elements,
    style: [
      { selector: 'node', style: { 'label': 'data(label)', 'font-size': 11, 'text-valign': 'center', 'color': '#fff',
        'background-color': (n) => color(n.data('cov')), 'width': 46, 'height': 46 } },
      { selector: 'node.group', style: { 'background-opacity': 0.06, 'border-width': 1, 'border-color': '#8886',
        'text-valign': 'top', 'color': '#888', 'font-size': 12, 'shape': 'round-rectangle', 'padding': 14 } },
      { selector: 'edge', style: { 'width': 1.5, 'line-color': '#8888', 'target-arrow-color': '#8888',
        'target-arrow-shape': 'triangle', 'curve-style': 'bezier' } },
      { selector: '.faded', style: { 'opacity': 0.12 } },
      { selector: '.hl', style: { 'line-color': '#e8a33d', 'target-arrow-color': '#e8a33d', 'width': 2.5, 'opacity': 1 } },
    ],
    layout: { name: 'cose', animate: false, padding: 30, nodeRepulsion: 9000, idealEdgeLength: 90 },
  });
  window.cy = cy; // exposed for inspection / testing

  const panel = document.getElementById('panel');
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const row = (k, v) => '<tr><td>' + k + '</td><td class="n">' + v + '</td></tr>';

  const showTotals = () => {
    const t = report.total;
    panel.innerHTML = '<h1>All files</h1><p class="sub">' + (t.files - t.missingBlock) + '/' + t.files + ' annotated</p>'
      + '<div class="bar"><i style="width:' + Math.round((t.files ? (t.files - t.missingBlock) / t.files : 0) * 100) + '%"></i></div>'
      + '<table>' + row('files', t.files) + row('missing block', t.missingBlock) + row('missing @kind', t.missingKind)
      + row('missing @partOf', t.missingPartOf) + row('@uses uncurated', t.usesUncurated)
      + row('@uses curated-empty', t.usesCuratedEmpty) + row('@uses curated', t.usesCurated) + '</table>'
      + '<p class="hint">Node colour = block coverage (red→green). Boxes group seams by class.</p>';
  };
  showTotals();

  cy.on('tap', (e) => { if (e.target === cy) { cy.elements().removeClass('faded hl'); showTotals(); } });
  cy.on('tap', 'node', (e) => {
    const n = e.target;
    if (n.hasClass('group')) return;
    const id = n.id(), c = byCat[id] || { files: 0, missingBlock: 0, missingKind: 0, missingPartOf: 0, usesUncurated: 0, usesCuratedEmpty: 0, usesCurated: 0, filePaths: [] };
    const hood = n.closedNeighborhood();
    cy.elements().addClass('faded'); hood.removeClass('faded'); hood.edgesWith(n).addClass('hl'); n.connectedEdges().addClass('hl');
    panel.innerHTML = '<h1>' + esc(id) + '</h1><p class="sub">' + (c.files - c.missingBlock) + '/' + c.files + ' annotated</p>'
      + '<div class="bar"><i style="width:' + Math.round((c.files ? (c.files - c.missingBlock) / c.files : 0) * 100) + '%"></i></div>'
      + '<table>' + row('files', c.files) + row('missing block', c.missingBlock) + row('missing @kind', c.missingKind)
      + row('missing @partOf', c.missingPartOf) + row('@uses uncurated', c.usesUncurated)
      + row('@uses curated-empty', c.usesCuratedEmpty) + row('@uses curated', c.usesCurated) + '</table>'
      + '<ul class="files">' + (c.filePaths || []).map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul>';
  });
</script>
</body>
</html>
`;
};
