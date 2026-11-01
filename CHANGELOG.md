# Changelog

## 0.5.0

Atlas works on any repo: any language, docs and plain files included.

- **Comment styles.** One table (`src/syntax/comments.ts`, exported) groups languages by how they
  write a comment: `c` (`/* */`), `html` (`<!-- -->`), `mdx` (`{/* */}`), `hash` (`#`), `slash`
  (`//`, Zig), `dash` (`--`), `semicolon` (`;;`), `dotdot` (`..`, reST). The parser, the stamper,
  the walker and the hooks all read it; matching ignores case. A repo adds files with
  `comments: { hash: ['.nix', 'Tiltfile'] }` in `.atlas/config.ts`; an unknown style is refused.
- **Line-comment blocks** are the `@atlas` line plus the axis lines after it (repeated prefixes
  like `;;`, `##`, `---` read as one; an empty comment line between axes is bridged); the first
  other line ends the block, so neighbouring prose is never rewritten. A one-line block holding
  only `@atlas` is filled in place.
- **The stamper** writes the block in the file's style, below a shebang (not `#![`), an Emacs
  `-*- -*-` line, Python's or Ruby's encoding line, Dockerfile parser directives, Markdown front
  matter, an XML prolog, `<?php` or CSS `@charset`. The C family writes plain `/* */` (`/**` is a
  doc comment in Rust, C#, Dart, Java and Go); JS/TS keep `/**`. Go and reST get a blank line
  after the block. A PHP file that starts as HTML gets none. A file with an unreadable `@atlas`
  comment never gets a second block; `stamp` reports both cases (`skipped`). An existing `/**`
  block in a non-JS C-family file is rewritten to `/*` on its next stamp.
- **Files with no comment syntax** (`.json`, `.txt`, images) are tagged by the stamp rules that
  match their path, never edited. `FileRecord.tagging` is `inline` or `path`; `coverage` lists them
  as `pathTagged`; `check` says "no comment style for this file and no stamp rule tags its path".
- **Walking.** `include` unset now means every file in a known comment style plus every file a
  rule tags. Files come from `git ls-files` (tracked, and untracked files not in `.gitignore`), so
  generated output and nested worktrees stay out, and Zealot's graph builds in 0.64 s instead of
  3.5 s. Outside a git work tree, or at a root the enclosing repo ignores, every file is listed;
  any other git failure is an error. Dot-directories are walked (`.github/`, `.claude/`); `.git`,
  `.atlas` (at any depth), `node_modules`, `dist` and submodules never are. A binary file with a
  source extension is skipped.
- **`atlas init`** detects the repo's languages and writes `.atlas/config.ts` (an include list for
  them), `kinds.ts` and `concepts.ts` (no concepts) from `examples/atlas-config/`.
- **No install needed.** Imports of `@inixiative/atlas` in any `.atlas/**/*.ts` file are bound to
  the running atlas, so `bunx @inixiative/atlas …` works in a repo with no `package.json`.
  `atlas setup` writes `bunx @inixiative/atlas@<version> hook …` there, and the installed binary
  where `package.json` depends on atlas; re-running it refreshes a hook setup wrote earlier (a new
  version, or a switch between the two). `bun src/cli.ts` runs the CLI like `bin/atlas.ts`.
- Hook and docs hints say `bunx @inixiative/atlas`, not `bunx atlas` (an unrelated npm package).
- Breaking (no shims): `parseAtlasBlock(source, style)`, `locateAtlasBlock(source, style)`,
  `renderBlock(spec, style)`, `applyStamp(source, resolved, { path, style }, mode)`,
  `walkFiles(root, ignore, keep)`; `StampResult.skipped`, `SetupReport.refreshed`; `LoadedConfig.include` is `string[] | null` and gains `comments`;
  `DEFAULT_INCLUDE` is gone. A block comment still needs `@atlas` on its own line, so a block a
  formatter collapsed onto one line is still reported as missing.

## 0.4.1

- `atlas generate`: a concept's kind breakdown counts `constructor` correctly. The counts lived in
  a plain object, so `counts.constructor` started as `Object`'s constructor and MAP.md printed
  `constructor(function Object() { [native code] }11)`.

## 0.4.0

- **Thesaurus** (`.atlas/thesaurus.ts`, optional), keyed by concept:
  `{ 'primitive:testFactories': { phrases: ['seed a user'], doc: 'TESTING.md#factories' } }`.
  `doc` is a `docs:` value (through `references.docs`) with an optional `#section`, defaulting to
  the concept's first `docs:` entry. `atlas hook grep` matches a pattern against the phrases,
  case-insensitively and on whole words: the phrase's words in order inside one alternative of the
  pattern (camelCase/snake_case split, filler words ignored), each in a simple English conjugation
  (`-s`/`-es`/`-ing`/`-ed`/`-er`, dropped `e`, doubled final consonant, `y`→`ies`), or the pattern
  as a regex over the whole phrase. At most eight thesaurus concepts render, then a count. Thesaurus hits are listed first, labelled `(thesaurus "<phrase>")` with a
  `read: <doc>#<section>` line, then the concept-name matches not already shown. The hook header now
  quotes the grep pattern itself.
- `atlas check` flags a thesaurus entry for an unregistered concept, with no phrases, with an empty
  phrase, or with a `doc` that doesn't resolve to a file (`[thesaurus]` problems; a scoped check
  skips the doc check). `loadConfig` throws on an entry that isn't exactly
  `{ phrases: string[]; doc?: string }`.
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
