# atlas glossary

**Every term atlas's region Wardens use, alphabetical, each with the region that holds it.**

<!-- Generated with the region Warden docs by the region pipeline's assemble.py. A term defined by two regions appears once per region. -->

---

## 1

**$1 capture**  
A captured path segment in a stamp rule's include glob, resolved with partOfFor. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

## A

**additionalContext**  
`hookSpecificOutput.additionalContext`, the field Claude Code adds to the agent's context. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**additive mode**  
Default stamp mode: fill only absent tags, never change existing ones, never touch @uses. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**agent-guidance**  
Class tag: the system-prompt / CLAUDE.md line sending agents to MAP.md and `graph --json`. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**agent-hooks**  
Class tag: the Claude Code hooks, their installer and the harness-agnostic hook API. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**ALWAYS_IGNORE**  
Paths never walked: .git, .atlas, node_modules, dist, atlas outputs, pnpm-lock.yaml. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**annotation-model**  
Class: the @atlas block's axes, their rules and the parse API. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**@atlas block**  
The top-of-file comment that opens with @atlas and holds a file's tags. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**atlas check**  
Exits 1 on any presence, vocab, reference or thesaurus problem; the CI command. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**atlas coverage**  
Reports unannotated files, @uses buckets, path-tagged files and unresolved captures. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**atlas generate**  
CLI command writing a byte-stable MAP.md at the repo root. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**atlas graph**  
CLI command printing reverse indexes: concept to files, @uses consumers, file to concepts, doc to concepts. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**atlas hook grep**  
Hook printing the concepts a grep pattern names, thesaurus first, then concept names. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**atlas hook read**  
Hook printing the concept neighbourhood of the file just read. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**@atlas pin**  
Marks a block exempt from `atlas stamp --overwrite` resyncing. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**atlas query**  
CLI command listing files by axis; flags are contains tests ANDed together. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**atlas report**  
CLI command writing COVERAGE.md and atlas.html. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**atlas setup**  
Merges both hooks into .claude/settings.json after asking; `--yes` skips the prompt. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**atlas stamp**  
The patcher CLI: dry-run by default, `--write` applies, targets are paths inside the root. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**atlas-config**  
Class: the repo-owned .atlas/ folder and the helpers that build and read it. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**atlas.html**  
Self-contained interactive Cytoscape.js graph of concepts grouped by class and coloured by coverage. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**.atlas/**  
The consumer's config folder: config.ts, kinds.ts, concepts.ts, optional thesaurus.ts. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**ATLAS_HOOK_DEBUG**  
Env var; set to 1 to see hook errors on stderr. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

## B

**Bun**  
The only runtime atlas runs on, because it imports .atlas/*.ts directly. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**byte-stable**  
Regenerating MAP.md from unchanged code produces identical bytes, so a diff means drift. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

## C

**cachedGraph**  
Graph for a root, cached in the OS temp dir for 10 minutes keyed by atlas version. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**check**  
Class: `atlas check`, verifying annotation presence and vocabulary. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**ci-rollout**  
Class: wiring atlas into CI: rollout, workflows, pre-commit hook, scripts. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**.claude/settings.json**  
Claude Code project settings file where hook entries live (CLAUDE_SETTINGS). *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**cli**  
Class: the `atlas` bin, the runCli dispatcher, shared flags and the `atlas: <msg>` exit-1 convention. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**comment-styles**  
Class: which comment syntax a file's block is written in, and where it is placed. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**COMMENT_STYLES**  
The named style definitions: c, html, mdx, hash, slash, dash, semicolon, dotdot. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**COMMENT_TABLE**  
Default map of comment style name to file extensions and file names. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**comments (config option)**  
`comments: { style: ['.ext', 'FileName'] }` in .atlas/config.ts adds or moves file types. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**concept neighbourhood**  
A file's concepts, their sibling files and @uses consumer counts, and the file's own @uses. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**conceptClass**  
Returns the class prefix of a concept key ('primitive' of 'primitive:stamp'). *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**conceptClasses**  
Lists the distinct classes used in a registry. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**ConceptRegistry**  
Type of CONCEPTS in concepts.ts: `class:name` keys mapped to bags of string lists. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**CONCEPTS**  
The registry export of .atlas/concepts.ts; repo-owned, structure only. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**constituent field**  
A registry list such as module or package that feeds partOfFor stamping. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**@constructs**  
What a constructor/factory file builds; constructors only. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**coverage**  
Class: `atlas coverage`, measuring and gating annotation progress. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**coverage baseline**  
.atlas/coverage-baseline.json: the committed count the ratchet compares to. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**COVERAGE.md**  
Diffable GitHub-native report: totals, Mermaid pie, gap table, Mermaid concept-dependency graph. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**curated**  
@uses bucket: a real @uses list. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**curated-empty**  
@uses bucket: `@uses none`. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**Cytoscape.js**  
Graph library embedded in atlas.html; no build step. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

## D

**DEFAULT_KINDS**  
atlas's built-in @kind vocabulary; a repo extends it in .atlas/kinds.ts. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**defineConfig**  
Typed wrapper for the default export of .atlas/config.ts. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**detectLanguages**  
init helper that finds which languages a repo has for the starter include list. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**doc**  
Optional thesaurus field: a docs value plus optional #section; defaults to the concept's first docs entry. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

## E

**effective concept**  
A file's declared @partOf, or the stamp rules' predicted concept when unannotated; report categories group by it. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**examples/atlas-config**  
Published, commented copy-paste .atlas/ set; the source atlas init reads. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**examples/ci**  
Published github-actions.yml, github-actions-incremental.yml and pre-commit hook. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**existence, not correctness**  
check never reconciles imports or judges whether a tag is true. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

## F

**file-discovery**  
Class: which files atlas considers and how it decodes them. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**findAtlasRoot**  
Finds the nearest directory above a file holding .atlas/, returning root and relPath. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

## G

**Graph**  
The graph type (exported from @inixiative/atlas) holding the reverse indexes. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**graph-query**  
Class tag: `atlas graph` reverse indexes and `atlas query` file filters. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**GRAPH_CACHE_TTL_MS**  
The 10-minute graph cache lifetime. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

## I

**include / ignore**  
config.ts globs choosing which files atlas considers; unset include means every known comment-style file plus path-tagged ones. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**init**  
Class: `atlas init`, writing a starter .atlas/ for the detected languages. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**@inixiative/atlas**  
The npm package; `bun add -d @inixiative/atlas` or `bunx @inixiative/atlas <command>`. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**@inixiative/atlas/config**  
The config entry exporting defineConfig and partOfFor for .atlas/config.ts. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**install-runtime**  
Class: installing atlas and running it on Bun, including the untrusted-repo caution. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**invert**  
Maps each value of a registry field to the sorted concept keys listing it. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**isPartOfFor**  
Type guard telling a partOfFor descriptor from a resolved partOf value. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

## J

**--json**  
Common flag for machine-readable output, e.g. `atlas graph --json`. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**json-rules predicate**  
A @inixiative/json-rules rule passed to `atlas query` as one JSON argument; ANDs with the flags. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

## K

**@kind**  
The file's role(s) from the closed vocab (kinds.ts); a role, never a layer. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**--kind / --partOf / --uses / --path**  
`atlas query` axis flags, each a contains test on one field. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**KINDS**  
The @kind vocab export of .atlas/kinds.ts, usually `[...DEFAULT_KINDS, …]`. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

## L

**line style**  
#, //, --, ;; or .. styles: the block is the @atlas line plus the tag lines right after it. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**loadConfig**  
Internal loader that imports and validates .atlas/ and binds its atlas imports. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**locateAtlasBlock**  
Public: locateAtlasBlock(source, style) returns the block's span. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

## M

**map-report**  
Class tag: generated artifacts, MAP.md via `atlas generate` and COVERAGE.md / atlas.html via `atlas report`. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**MAP.md**  
The generated concept overview agents are told to read first. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**MAP.md**  
The committed concept overview, a projection of the code's @atlas blocks. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**MAP.md freshness gate**  
CI step: `atlas generate` then `git diff --exit-code MAP.md`. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**mergeAtlasHooks**  
Adds or refreshes atlas hook entries in a settings object, keeping other hooks. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**Mermaid**  
Diagram syntax GitHub renders; used for COVERAGE.md's pie and dependency graph. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**--min**  
Coverage floor: fail below the given percentage annotated. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

## O

**--out / --md / --html**  
`atlas report` flags: output directory, and only the Markdown or only the HTML artifact. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**--overwrite**  
Resync @kind/@partOf to the current rules; skips pinned blocks and curated @uses. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

## P

**parseAtlasBlock**  
Public: parseAtlasBlock(source, style) reads a block's fields, or null. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**@partOf**  
The class:name concept(s) the file composes; multiple is normal. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**partOfFor**  
Stamp-rule helper: partOfFor('module', '$1') resolves a captured folder to concepts listing it in that field. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**path-tagged file**  
A file with no comment syntax (.json, .txt) whose tags come from matching stamp rules. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**path-tagged file**  
A file with no comment syntax whose tags come from matching stamp rules; never edited. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**phrases**  
Thesaurus field: base-form words people search with when they mean the concept. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**PostToolUse**  
Claude Code hook event fired after a tool call; atlas hooks the Read and Grep tools. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**pre-commit hook**  
examples/ci/pre-commit: runs check on staged files. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**preamble**  
What must stay above the block: shebang, encoding line, front matter, XML prolog, <?php, @charset. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**presence problem**  
A considered file with no @atlas block. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**proposed**  
@uses bucket: `@uses? x` awaiting acceptance. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

## R

**--ratchet**  
Fail if the unannotated count exceeds .atlas/coverage-baseline.json. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**REACH_KINDS**  
Kinds (factory, constructor) that get an extra per-concept count line in the neighbourhood. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**reference field**  
A registry list such as docs, checked for existence when a resolver exists. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**reference problem**  
A concept's doc reference that doesn't resolve through its `references` resolver. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**references**  
config.ts map of field to resolver turning a reference value into a repo path, e.g. `docs: (v) => 'docs/' + v`. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**references.docs**  
Config resolver turning a docs value into a repo path; also resolves thesaurus doc. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**renderConceptMatches**  
Plain-text concepts matching a grep pattern from a Graph. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**renderNeighbourhood**  
Plain-text neighbourhood of a file path from a Graph. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**reverse index**  
A lookup from a concept (or doc) back to the files that are part of it or use it. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**rollout**  
warn-only → incremental enforcing → fully enforcing. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**--root / --json**  
Shared flags: repo root to operate on (default cwd); machine-readable output. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

**runClaudeCodeHook**  
Claude Code adapter: PostToolUse stdin JSON in, additionalContext JSON out; never throws. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**runCli**  
Internal dispatcher behind the `atlas` bin; errors become `atlas: <msg>`, exit 1. *Region:* [Install, CLI and .atlas config](setup-and-config/knowledge.md)

## S

**scoped targets**  
`atlas check <paths…>` enforces only those files and skips registry-wide reference checks. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**setupClaudeHooks**  
Programmatic `atlas setup`: read, merge and write .claude/settings.json. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**stamp**  
Class: writing and resyncing blocks from path rules with `atlas stamp`. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**stamp rules**  
`stamp` entries in .atlas/config.ts {include, exclude?, kind?, partOf?, constructs?}; they compose, explicit tags win. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**--stdout**  
`atlas generate --stdout` prints MAP.md instead of writing it. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

**styleFor**  
Public: the comment style object for a path, or null if unknown. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

## T

**thesaurus**  
Class tag: the optional .atlas/thesaurus.ts mapping search phrases to concepts. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**THESAURUS**  
Export of .atlas/thesaurus.ts, type Thesaurus, keyed by concept id. *Region:* [Agent hooks and thesaurus](agent-integration/knowledge.md)

**transitive edge**  
An indirect dependency (A uses B uses redis) that grep misses and `atlas graph` catches. *Region:* [Map, graph, query and reports](map-outputs/knowledge.md)

## U

**uncurated**  
A file with no @uses line at all. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**uncurated**  
@uses bucket: no @uses line. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**--update-baseline**  
Write the current unannotated count to the baseline; commit it. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

**@uses**  
Concepts the file really depends on but is not part of; never auto-stamped. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**@uses none**  
Curated-empty: someone looked and found no real dependency. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

**@uses?**  
Proposed dependency awaiting acceptance. *Region:* [The @atlas annotation block](annotation-blocks/knowledge.md)

## V

**vocab problem**  
@kind not in kinds.ts, or @partOf/@uses naming a concept not in concepts.ts. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)

## W

**--warn-only**  
check prints problems but always exits 0; the rollout start. *Region:* [Check, coverage and CI gates](validation-and-ci/knowledge.md)
