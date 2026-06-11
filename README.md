# atlas

**The map of the codebase.** atlas reads `@atlas` annotations declared at the top of each file,
validates them against a repo-owned **concept registry**, and generates a `MAP.md` that *cannot drift
on the structural facts* — because atlas only ever asserts what is mechanically true (what exists,
how it connects), never maturity or correctness.

It's a Biome-shaped tool: a small CLI plus a `.atlas/` config folder. The tool is generic; **your
repo defines its own vocabulary.**

```ts
/**
 * @atlas
 * @kind controller
 * @partOf feature:tenancy
 * @uses primitive:authz, infrastructure:redis
 */
```

## Why

Hand-maintained maps (FEATURES.md, docs, prose) drift from the code. atlas makes the map a
*projection* of the code: every file declares traversable **concepts** — what it is, what it's part
of, what it uses — so the repo is explorable by **concept** instead of by crawling folders.
"Show me everything that touches caching" becomes one traversal.

The core discipline: **meaning emerges from the intersection of several true edges**, not from one
hyper-specific label. Keep the vocabulary broad but closed; apply it liberally.

## Install

```bash
bun add -d @inixiative/atlas
```

atlas is Bun-native (it imports your `.atlas/*.ts` config directly).

## Configure

A consuming repo gets a `.atlas/` folder. atlas ships a sensible default `kinds` vocab; the
repo **owns** its concept registry.

```
.atlas/
  config.ts     // stamp rules (path → tags) + ignore + reference resolvers
  kinds.ts      // @kind vocab — extends atlas's defaults
  concepts.ts      // the concept registry — repo-OWNED, structure only
```

```ts
// .atlas/concepts.ts — structure only, no status/note. YOU define the concept classes
// (feature/primitive/…) and the constituent categories (module/package/…).
import type { ConceptRegistry } from '@inixiative/atlas';

export const CONCEPTS: ConceptRegistry = {
  'feature:tenancy': { module: ['organization', 'space'], docs: ['AUTH.md'] },
  'infrastructure:redis': { docs: ['REDIS.md'] },
};
```

```ts
// .atlas/config.ts — stamp rules compose; explicit always wins.
import { defineConfig, partOfFor } from '@inixiative/atlas/config';

export default defineConfig({
  include: ['apps/**/*.ts', 'packages/**/*.ts'],
  ignore: ['**/*.test.ts', '**/index.ts'],
  stamp: [
    { include: '**/controllers/**', kind: 'controller' },          // @kind from a structural glob
    { include: 'apps/api/src/modules/$1/**', partOf: partOfFor('module', '$1') }, // @partOf from a capture
  ],
  references: { docs: (v) => `docs/${v}` },                         // for reference-existence checks
});
```

A complete, commented set you can copy into your repo's `.atlas/` is in
[`examples/atlas-config/`](./examples/atlas-config/) (`kinds.ts`, `concepts.ts`, `config.ts`).

## CLI

```bash
atlas graph       # reverse indexes: concept → files, file → concepts, doc → concepts
atlas check       # presence + vocab existence + reference existence  (the CI command)
atlas coverage    # unannotated files; @uses curation buckets; unresolved memberships
atlas generate    # write MAP.md from the annotated tree
atlas report      # coverage gaps + concept graph → COVERAGE.md (Mermaid) and atlas.html (Cytoscape)
atlas stamp [dir] # write/refresh @atlas blocks from the rules (the patcher; dry-run by default)
```

Common flags: `--root <dir>`, `--json`, `generate --stdout`, `stamp --write`, `stamp --overwrite`,
`coverage --min/--ratchet`, `report --out <dir>/--md/--html`.

## For AI agents

atlas exists largely so agents stop grab-bagging files and answering from stale labels. Drop this
line into your agent's system prompt / `CLAUDE.md` / `AGENTS.md` so it navigates by **concept**
instead of crawling folders:

> This repo is mapped by **atlas**. To find code by concept instead of by filename: read `MAP.md`
> for the concept overview; run `bunx atlas graph --json` for the reverse indexes (concept → files via
> `@partOf`, concept → consumers via `@uses`); and read a file's top-of-file `@atlas` block
> (`@kind` / `@partOf` / `@uses`) before its body. Prefer these over `grep` for "what touches X" /
> "what's part of Y" questions.

Why it helps: the agent gets the high-altitude map without reading the tree, answers "everything
that touches caching" in **one** `graph --json` call, and learns a file's role/edges from its block
before opening it. In an A/B test on a repo with a transitive dependency, agents given this line
used `atlas graph` and solved a "what reaches redis (directly or transitively)" question in ~2 tool
calls; agents left to `grep` took 2–3× as many and risk missing the transitive edge entirely.

## Visualize

`atlas report` emits two artifacts:

- **`COVERAGE.md`** — diffable, GitHub-native: a totals table, a Mermaid coverage pie, a per-category
  gap table (required `@kind`/`@partOf` gaps split from the `@uses` curation buckets), and a Mermaid
  concept-dependency graph. Categories group by **effective concept** — a file's declared `@partOf`, or the
  rules' *predicted* concept when unannotated — so you get a per-concept work plan even at 0% coverage.
- **`atlas.html`** — a self-contained interactive graph ([Cytoscape.js](https://js.cytoscape.org/)):
  concepts grouped by class (compound nodes), coloured by coverage; click a concept to drill into its file
  list, click to highlight its dependencies (traverse). No build step — open it in a browser.

## The annotation model

| Question | Tag | Value | Notes |
|----------|-----|-------|-------|
| What is this? | `@kind` | closed enum | 1+, e.g. `entrypoint, route` (a role, not a layer) |
| What is it part of? | `@partOf` | `class:name` concept(s) | membership; multi is normal |
| What does it use? | `@uses` | `class:name` concept(s) | dependency, load-bearing only |
| What does it build? | `@constructs` | factory output | constructors only |

All axes are multi-valued (comma-separated on one line). `@atlas` opens the block.

### Writing a block (for agents & humans)

A top-of-file JSDoc block, above the imports (below a shebang if present):

```ts
/**
 * @atlas
 * @kind controller
 * @partOf feature:billing, superadmin
 * @uses primitive:authz, infrastructure:redis
 */
```

Rules of thumb:
- **`@kind` is a ROLE, never a layer.** Use the file's role(s) from the vocab. Never put `feature`/`primitive`/`infrastructure` in `@kind` — those are concept *classes*, expressed via `@partOf`. A file can hold several roles (`constructor, registry`).
- **`@partOf` is membership** — the concept(s) this file *composes* (remove it and the concept breaks). Multiple is normal and expected: a feature has **many** controllers/routes/**entrypoints**; a file can be part of a feature *and* a cross-cutting tag (`feature:inquiry, superadmin`). The reusable helpers that build something belong to it — e.g. `makeController` and the route-template helper services are all `@partOf primitive:routeTemplates`.
- **`@uses` is dependency, LOAD-BEARING only** — a concept this file depends on but isn't part of, where someone reasoning about that concept's blast radius needs this file. Not every import. Skip incidental touches (one `db.x.update()` through the request context is not "using" the database). Write `@uses none` only after a human/agent looked and it genuinely uses nothing load-bearing; otherwise omit the line (= uncurated).
- **Validate names against the repo's `.atlas/`** — `@kind` ∈ `kinds.ts`; `@partOf`/`@uses` must name a concept that exists in `concepts.ts`.
- **Prefer several broad-true tags over one narrow tag** — meaning emerges from the intersection of true edges, not from one hyper-specific label.

### `@uses` is never auto-stamped

Absence is meaningful, so atlas leaves `@uses` out of stamping entirely:

- **no `@uses` line** = *uncurated* (nobody filled it in)
- **`@uses none`** = *curated-empty* (a human looked; it uses nothing load-bearing)
- **`@uses? x`** = *proposed* (a patcher suggestion awaiting acceptance)

`coverage` reports these as distinct buckets.

## The patcher: `atlas stamp`

Blanks are fillable on demand — the `eslint --fix` shape. Always **dry-run by default**; pass
`--write` to apply.

- **Targeting** — `all` (default), a folder, or a single file.
- **Additive (default)** — fill only what's absent; never modify an existing tag; never touch `@uses`.
- **Overwrite (`--overwrite`)** — resync the derivable axes (`@kind`/`@partOf`) to the current
  rules; **never** overwrites curated `@uses`. A `@atlas pin` block is exempt.

## CI

`atlas check` is the CI primitive — it exits non-zero on any problem, so wiring it in is just
running it in a workflow (no separate package needed). Copy-paste examples live in
[`examples/ci/`](./examples/ci/): a full-repo GitHub Actions workflow with a `MAP.md` freshness
gate, an incremental PR variant, and a pre-commit hook. The recommended rollout on an existing
codebase is **warn-only → incremental enforcing → fully enforcing**:

```bash
atlas check --warn-only   # prints problems, never fails CI (rollout start)
atlas check <path>        # enforce only changed paths (skips registry-wide reference checks)
atlas check               # enforce the whole repo
```

Gate **coverage** the same way — a percentage floor or a ratchet that forbids regressions
(ideal for a repo starting near 0%):

```bash
atlas coverage --min 80          # fail below 80% annotated
atlas coverage --ratchet         # fail if unannotated count exceeds .atlas/coverage-baseline.json
atlas coverage --update-baseline # record the current count (commit the baseline)
```

## Enforcement: existence, NOT correctness

`atlas check` verifies annotations **exist and use valid vocabulary** — presence of a block, that
`@kind` is in the vocab, that `@partOf`/`@uses` name a concept that exists, and that a
concept's doc references resolve. It explicitly does **not** reconcile the import graph, judge
whether a `@partOf` is "really true," or derive any status. Those are fool's errands that trade a
clear structural guarantee for a fragile proxy.

## License

MIT
