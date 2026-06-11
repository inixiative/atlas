# atlas in CI

atlas needs no separate "ci-rules" package — `atlas check` *is* the CI primitive (it exits non-zero
on any problem). These are copy-paste examples for wiring it in. Pick the ones you need.

| File | What it does |
|------|--------------|
| [`github-actions.yml`](./github-actions.yml) | Full-repo check + coverage ratchet + `MAP.md` freshness gate (push/PR) |
| [`github-actions-incremental.yml`](./github-actions-incremental.yml) | Check only the paths changed in a PR |
| [`pre-commit`](./pre-commit) | Local git hook: check staged source dirs before commit |

## Rollout (DEV-003 Phase 4): warn-only → enforcing

`atlas check` is binary (any problem fails). On an existing codebase that starts at ~0% annotated,
flip the switch gradually:

1. **Warn-only** — `atlas check --warn-only` prints problems but always exits 0. Wire it into CI so
   the signal is visible without blocking merges while you back-fill annotations.
2. **Incremental enforcing** — gate only the paths a PR touches with `atlas check <path>` (skips the
   registry-wide reference check, so it's about the changed files only). New code must be annotated;
   legacy code is grandfathered.
3. **Fully enforcing** — once coverage is high, drop to plain `atlas check` on the whole repo.

Track progress between phases with `atlas coverage`.

## Coverage gate

`atlas coverage` exits non-zero when a gate fails, so it drops into CI like `check`. Two styles:

```bash
atlas coverage --min 80     # percentage floor — fail below 80% annotated
atlas coverage --ratchet    # backslide guard — unannotated count may not exceed the baseline
```

The **ratchet** is the right gate for a repo starting near 0%: instead of demanding an unreachable
percentage, it forbids regressions. Commit a baseline, then tighten it as you back-fill:

```bash
atlas coverage --update-baseline   # writes .atlas/coverage-baseline.json  (commit this)
git add .atlas/coverage-baseline.json
```

In CI, `atlas coverage --ratchet` then fails any PR that adds unannotated files. Re-run
`--update-baseline` and commit whenever you lower the count, so it only moves one direction.
Switch to `--min` once coverage is high enough to hold a percentage.

## Keep `MAP.md` honest

The map is a projection of the code, so a stale `MAP.md` in a PR is a bug. Regenerate and diff:

```bash
atlas generate
git diff --exit-code MAP.md   # fails CI if the committed map is out of date
```

## package.json scripts

```jsonc
{
  "scripts": {
    "atlas:check": "atlas check",
    "atlas:map": "atlas generate",
    "atlas:coverage": "atlas coverage",
    "atlas:stamp": "atlas stamp --write"
  }
}
```

## Why not a standalone `@inixiative/atlas-ci` package?

The "rules" that vary per repo (stamp rules, vocab, the concept registry) already live in the consumer's
`.atlas/` folder — there is no shared executable logic to extract; a package would contain only the
YAML above. The only future case that justifies a separate artifact is a rich **GitHub Action**
(inline PR annotations, caching) — and that ships as its own action repo, not an npm package. Until
then, these examples are enough.
