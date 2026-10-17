# Changelog

## Unreleased

- **Thesaurus** (`.atlas/thesaurus.ts`, optional), keyed by concept:
  `{ 'primitive:testFactories': { phrases: ['seed a user'], doc: 'TESTING.md#factories' } }`.
  `doc` is a `docs:` value (through `references.docs`) with an optional `#section`, defaulting to
  the concept's first `docs:` entry. `atlas hook grep` matches a pattern against the phrases,
  case-insensitively and on whole words: the phrase's words in order inside one alternative of the
  pattern (camelCase/snake_case split, filler words ignored), each in a simple English conjugation
  (`-s`/`-es`/`-ing`/`-ed`/`-er`, dropped `e`, `y`→`ies`), or the pattern as a regex over the whole
  phrase. Thesaurus hits are listed first, labelled `(thesaurus "<phrase>")` with a
  `read: <doc>#<section>` line, then the concept-name matches not already shown. The hook header now
  quotes the grep pattern itself.
- `atlas check` flags a thesaurus entry for an unregistered concept, with no phrases, with an empty
  phrase, or with a `doc` that doesn't resolve to a file (`[thesaurus]` problems; also run on
  scoped checks). `loadConfig` throws on an entry that isn't `{ phrases: string[]; doc?: string }`.
- `Graph` (and `graph --json`) carries `thesaurus` with each doc resolved to a repo path;
  `Thesaurus` and `ThesaurusEntry` types exported.

## 0.3.0

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
