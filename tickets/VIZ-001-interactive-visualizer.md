# VIZ-001: A proper interactive visualizer

**Status**: 🆕 Not Started
**Priority**: Medium
**Created**: 2026-06-12

---

## Why

atlas's power is relationships — concept membership, `@uses` dependency edges, and
cross-cutting tags. The CLI surfaces these as text (`query`, `graph --json`), which is
authoritative but hard to *read*. A dogfood A/B (atlas vs grep, answering "what composes
feature:auth / what does it depend on / what's superadmin-gated") surfaced two concrete
papercuts that a visual map would dissolve:

- **Direction is invisible in text.** `atlas query --uses <concept>` returns *consumers*
  (reverse), while "what does X depend on" needs the *forward* union of X's members'
  `@uses`. Agents and humans both misread this. A graph with **directed edges** makes
  depends-on vs used-by obvious at a glance.
- **The wins are spatial.** "What's part of feature:auth" and "what's superadmin-gated"
  are sets best *seen* (clusters), and gating-by-position (e.g. everything under the
  admin router) reads instantly as a highlighted region.

Today `atlas report` emits a static single-graph `atlas.html` (Cytoscape) + `COVERAGE.md`
(Mermaid). It's a start, not a tool you'd actually navigate a large codebase with.

## Goals

- **Interactive concept graph**: click a concept → its member files, its `@uses`
  dependencies (directed, outbound) and its consumers (inbound), distinguished clearly.
- **Click a file → its concepts** (`@kind` / `@partOf` / `@uses`), and link to source.
- **Direction & class made visual**: arrowed edges for dependencies; color/group by class
  (feature / primitive / infrastructure / integration); cross-cutting tags (e.g.
  `superadmin`) as a highlightable overlay, not just another node.
- **Coverage overlay**: annotated vs. unannotated files, and the `@uses` curation buckets,
  toggled on the same view (folds in what `coverage`/`report` show today).
- **Search + filter + drill-down**: filter by `--kind/--partOf/--uses/--path`, focus a
  subgraph, expand/collapse.

## Non-goals (v1)

- Live/watch mode (regenerate on save) — `generate`/`report` are fine to re-run.
- Editing annotations from the UI — atlas stays the source of truth via `stamp`/blocks.
- A hosted service — it's a self-contained generated artifact, like `atlas.html` today.

## Notes

- Builds on the existing `graph` reverse indexes (concept→files, file→concepts,
  doc→concepts) and `report` renderers (`src/render/html.ts`, `src/render/markdown.ts`).
- The data is already there (`graph --json`); this is primarily a rendering/UX upgrade.
