# Adversarial review — atlas (2026-06-11)

Four independent adversarial reviewers (correctness, silent-failure, test-coverage, type-design) against `main` @ `0721429`. Findings deduplicated and severity-ranked. Several were **empirically verified** by the reviewers running the real code. None is a crash-on-load — the tool works — but there's a cluster of "green on broken input/config" failure modes that matter for a tool whose whole point is trust.

Fix order should be test-first (each finding below names the regression test to add).

## Critical

- **C1 · CRLF line endings zero out every annotation.** `parse/parseAtlasBlock.ts` — `AXIS_LINE` + `split('\n')` leaves `\r` in values; a CRLF-authored file parses to an *empty* annotation, so `coverage`/`check`/`report`/`graph`/`generate` all silently undercount. Worse, in `stamp/patcher.ts` the located block (with `\r`) never equals the LF-rendered block → `changed:true` on every run, mixed line endings written. *Test: parse a `\r\n` block == LF equivalent; additive re-stamp of CRLF file is idempotent.*

- **C2 · Missing / mis-exported `.atlas/seams.ts` (or `config.ts`) silently becomes `{}`.** `config/load.ts` — `named()` can't tell "file absent" (ok → default) from "file present, wrong export" (a real misconfig). Result: registry silently empty → `check` either passes against nothing (scoped mode skips references) or floods false "not a registered seam"; `MAP.md`/report come out empty; CI green on a config that never loaded. *Fix: throw when a present file lacks its expected export; warn when `.atlas/` exists but `seams.ts`/`config.ts` resolve empty. Test: each case.*

## High

- **H1 · `--min <non-numeric>` silently disables the coverage gate.** `cli.ts` + `commands/coverage.ts` — `Number('abc')=NaN`, `percent < NaN` is always false → gate passes, prints ✓, exits 0. Also `--min` with no value → `Number('')=0` (trivially passes); `--baseline` with no value → resolves to the root dir. A fat-fingered threshold turns the gate *off*. *Fix: validate `Number.isFinite`; treat missing value-flag args as errors. Test: `--min abc` exits 1.*

- **H2 · Multi-line / mixed `@uses` corrupts state.** `parse/parseAtlasBlock.ts` — `usesState` is last-line-wins while values accumulate: `@uses x` then `@uses none` → `{state:'none', uses:['x']}` (contradiction); `@uses none, seam:a` keeps the literal `"none"` as a phantom seam (fails vocab, phantom graph node). *Fix: compute state from the final set / reject a second `@uses` / drop the `none` token in multi-value. Test both.*

- **H3 · Mermaid seam-graph label injection / breakage.** `render/markdown.ts:42` — `safeId(n.id)` sanitizes the node *id* but the label interpolates raw `n.id` inside `["..."]`; a seam id containing `"`/`]` breaks the diagram or injects Mermaid directives. (The HTML renderer escapes correctly; markdown doesn't.) *Fix: escape the label. Test: seam id with `"`.*

- **H4 · `atlas stamp` discards `unresolved` memberships.** `commands/stamp.ts` → `computeStamp` drops `ResolvedStamp.unresolved`; a `partOfFor` capture that maps to no seam is stamped with *no* `@partOf` and **nothing is printed**. Only `coverage` surfaces it (non-JSON, easy to miss). Root cause of a missing tag is invisible at write time. *Fix: warn per file from `runStamp`. Test: stamp a file whose capture resolves to zero seams emits a warning.*

## Medium

- **M1 · FD exhaustion (EMFILE) on large repos.** `analyze.ts` and `stamp.ts --write` use unbounded `Promise.all` over every matched file (template = 4292 files). *Fix: bound concurrency (~64–256). Test: optional.*

- **M2 · No top-level error boundary.** `bin/atlas.ts` / `cli.ts` — an unreadable file (`analyze` `Promise.all`), corrupt baseline JSON (`readBaseline` `file.json()`), or a throwing consumer `references` resolver (`check.ts:41`) bubbles up as a raw unhandled rejection with a *nondeterministic exit code* — bad contract for a CI tool. *Fix: wrap `runCli` body; turn resolver throws into a `reference` Problem. Test: corrupt baseline → friendly error + exit 1.*

- **M3 · Empty repo / zero matched files → cheerful 100% pass.** wrong `--root` or an `include` that matches nothing → `coverage` reports 100%, gate passes, degenerate Mermaid pie (`0/0`). Compounds C2. *Fix: warn (and arguably fail an active gate) when `walkFiles` returns 0. Test.*

- **M4 · Per-category file counts exceed totals.** `commands/report.ts` — multi-`@partOf` files are tallied in every category, so `sum(category.files) > total.files`. Markdown has a one-line caveat; `--json` and `atlas.html` expose the overlap with no signal. *Fix: document in the JSON/field or expose an "in multiple seams" metric.*

- **M5 · `applyStamp` orphans a pre-existing leading JSDoc.** `stamp/patcher.ts:50` — the "no block yet" branch prepends the atlas block *above* an existing `/** license/doc */`, detaching it from its declaration (two adjacent block comments). *Fix: insert after a leading non-atlas comment / above the first import. Test.*

## Low / nits

- **L1 · glob**: wildcards inside `{...}` are escaped to literals (`x.{j*,ts}` won't match `x.js`); trailing `dir/**` doesn't match the bare `dir`; out-of-order `$2/$1` works but is untested. `config/glob.ts`.
- **L2 · determinism**: `stampFor` sorts `@partOf` but additive `union()` keeps insertion order — two files in the same seam set can render `@partOf` in different orders. `stamp/patcher.ts`.
- **L3 · duplicates within an axis line** (`@partOf x, x`) survive in overwrite mode and double-count in `report`. `parse` `splitValues`.
- **L4 · `axes` vs named fields** can diverge if mutated (treat `axes` as read-only raw).

## Type design (improvements, not bugs)

- **T1 (high value) · `Uses` discriminated union** so illegal states are unrepresentable: `{state:'none'}` literally can't carry values. Replaces `uses:string[]` + `usesState` (which can disagree). Touches read sites in `report`/`check`/`patcher`.
- **T2 · Validate/brand seam keys (`class:name`) at load** → `seamClass` becomes total, kills the silent `(unmapped)`/`'other'` degradation (overlaps C2).
- **T3 · Tighten `isPartOfFor`** to verify `category`/`capture` are strings (guard currently over-claims).
- **T4 · Derive `AtlasConfigInput`/`LoadedConfig` from a shared base** to prevent field drift.
- **Confirmed good:** keep `SeamEntry = Record<string,string[]>` generic — do *not* hardcode categories; the genericity is correct. The 4-state `@uses` concept is the standout design decision.

## Verified-good (no action)

HTML renderer escaping (`embed` escapes `<`; `esc` for innerHTML) — no XSS. Dry-run-by-default on `stamp`. `loadModule` correctly *propagates* a present file's runtime error (the gap is only absent-vs-wrong-export). `stampFor` composition + `invert` have strong, sharp tests.
