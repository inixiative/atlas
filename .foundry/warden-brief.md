# atlas, for its Wardens

atlas (`@inixiative/atlas`) is a published Bun/TypeScript CLI and library that maps a codebase
by concept. Each file declares an `@atlas` block (`@kind`, `@partOf`, `@uses`, `@constructs`) in
its own comment syntax, or is tagged by its path. A consumer repo owns the vocabulary in `.atlas/`
(`config.ts`, `kinds.ts`, `concepts.ts`, optionally `thesaurus.ts`). atlas checks the blocks
against it, stamps blocks from path rules, and builds the graph, `MAP.md`, the coverage report
and the Claude Code Read/Grep hooks. Help a consumer use atlas from their own repo: the CLI and
`.atlas/` config first, and the library exports only where code needs them.

## Shape of the repository

- Two entries: `.` (`src/index.ts`, the public API) and `./config` (`src/config/defineConfig.ts`).
  Anything else under `src/` is internal; app code runs the CLI.
- `bin/atlas.ts` is the `atlas` bin; `src/cli.ts` parses flags and holds the help text.
  `src/commands/` has one file per command (check, coverage, generate, graph, init, query,
  report, setup, stamp).
- `src/parse` (reading a block), `src/syntax/comments.ts` (comment styles and placement),
  `src/stamp/patcher.ts` (writing a block), `src/config/` (loading `.atlas/`, globs, stamp rules),
  `src/hook/` (the Read/Grep hooks and the graph cache), `src/render/` (COVERAGE.md, atlas.html).
- `test/`: bun tests, several over `test/fixtures/`. `test/readme.test.ts` holds the README's
  comment-style table equal to `COMMENT_TABLE`.
- Check: `bun run check` (typecheck, Biome, tests). `README.md` is the full doc;
  `examples/atlas-config/` and `examples/ci/` are copy-paste starting points.

## Rules that hold everywhere

- atlas maps only mechanical facts: what exists and how it connects. `atlas check` enforces
  existence and valid vocabulary, never whether a tag is true, and nothing reconciles imports.
- `@kind` is a role, never a layer. `@uses` is never auto-stamped: no line, `@uses none` and
  `@uses? x` are different states. `--overwrite` resyncs only `@kind`/`@partOf` and skips
  `@atlas pin` blocks.
- `atlas stamp` is a dry-run unless `--write`.
- Hooks fail silent: they print nothing on any failure, and the commands `atlas setup` writes
  end in `|| true`. A repo that depends on atlas runs `node_modules/.bin/atlas`;
  any other runs `bunx @inixiative/atlas@<version>`, never `bunx atlas` (an unrelated package).
- Running atlas runs the repo's `.atlas/**/*.ts`. Read it first on a repo you don't trust.
- The only runtime dependency is `@inixiative/json-rules`.

## Words used here

block, axis, concept, concept class, kind, membership (`@partOf`), dependency (`@uses`),
uncurated, curated-empty, proposed, pin, comment style, preamble, path-tagged, stamp rule,
capture, partOfFor descriptor, registry, reverse index, neighbourhood, reach kinds, thesaurus,
ratchet, baseline.
