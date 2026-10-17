# Changelog

## Unreleased

- `atlas hook read` / `atlas hook grep`: Claude Code PostToolUse hooks that put a file's concept
  neighbourhood (siblings, `@uses` consumers, its own `@uses`, and for factories/constructors the
  count of that kind in the concept) or a grep pattern's matching concepts into the agent's
  context. Replaces the atlas half of the hand-copied `glossAtlasOnRead`/`glossAtlasOnGrep` hooks.
- `atlas setup [--yes]`: offers to merge both hooks into `.claude/settings.json`; idempotent.
- `graph --json`: `fileToConcepts` entries carry `kind`.
- Library exports for the core (`renderNeighbourhood`, `renderConceptMatches`, `findAtlasRoot`,
  `cachedGraph`) and the Claude Code adapter (`runClaudeCodeHook`).

## 0.2.0

- Depends on `@inixiative/json-rules` ^3.3.0 (0.1.1 was published depending on ^2.13.0, so
  consumers installed a second json-rules 2.x through atlas).
- `prepare` installs lefthook only inside a git checkout.
