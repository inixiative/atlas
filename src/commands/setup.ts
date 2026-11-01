import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOOK_EVENTS, type HookEvent } from '../hook/claudeCode.ts';

export const CLAUDE_SETTINGS = '.claude/settings.json';

type HookCommand = { type: string; command?: string; [key: string]: unknown };
type MatcherGroup = { matcher?: string; hooks?: HookCommand[]; [key: string]: unknown };
type ClaudeSettings = { hooks?: Record<string, MatcherGroup[]>; [key: string]: unknown };

const HOOKS: Record<HookEvent, { matcher: string; statusMessage: string }> = {
  read: { matcher: 'Read', statusMessage: 'atlas: concept neighbourhood of this file' },
  grep: { matcher: 'Grep', statusMessage: 'atlas: concepts matching this pattern' },
};

// How the hook runs atlas. A repo that depends on @inixiative/atlas runs its own install (not
// `bunx atlas`, which would fetch an unrelated npm `atlas` package); $CLAUDE_PROJECT_DIR keeps it
// working when the session's cwd moves into a subdirectory, and the existence guard keeps a
// committed settings.json silent for a teammate who hasn't run `bun install` yet. Any other repo
// (Python, Go, docs) has no node_modules, so the hook runs the scoped package through bunx,
// pinned to the version that wrote it.
export type HookRunner = { installed: true } | { installed: false; version?: string };

const ATLAS_BIN = '"$CLAUDE_PROJECT_DIR/node_modules/.bin/atlas"';
export const hookCommandFor = (
  event: HookEvent,
  runner: HookRunner = { installed: true },
): string => {
  if (runner.installed) return `[ -e ${ATLAS_BIN} ] && bun ${ATLAS_BIN} hook ${event} || true`;
  const pkg = runner.version ? `@inixiative/atlas@${runner.version}` : '@inixiative/atlas';
  return `cd "$CLAUDE_PROJECT_DIR" && bunx ${pkg} hook ${event} 2>/dev/null || true`;
};

// A repo installs atlas when its package.json depends on it.
export const runnerFor = (root: string, version?: string): HookRunner => {
  const pkg = join(root, 'package.json');
  if (existsSync(pkg) && /"@inixiative\/atlas"\s*:/.test(readFileSync(pkg, 'utf8')))
    return { installed: true };
  return { installed: false, version };
};

const hookCommand = (event: HookEvent, runner?: HookRunner): HookCommand => ({
  type: 'command',
  command: hookCommandFor(event, runner),
  timeout: 20,
  statusMessage: HOOKS[event].statusMessage,
});

export const atlasHookEntry = (event: HookEvent, runner?: HookRunner): MatcherGroup => ({
  matcher: HOOKS[event].matcher,
  hooks: [hookCommand(event, runner)],
});

// `atlas hook read`, `atlas.ts" hook read`, `@inixiative/atlas@0.5.0 hook read`.
const ATLAS_HOOK = (event: HookEvent) =>
  new RegExp(`\\batlas(\\.ts)?(@[\\w.-]+)?"?\\s+hook\\s+${event}\\b`);

const hasAtlasHook = (groups: MatcherGroup[], event: HookEvent): boolean =>
  groups.some((g) => (g.hooks ?? []).some((h) => ATLAS_HOOK(event).test(h.command ?? '')));

// Merge the two PostToolUse entries into existing settings without touching anything
// else: an existing group for the same matcher gains the command; otherwise a new group
// is appended. An entry already present (any matcher group) is left alone.
export const mergeAtlasHooks = (
  settings: ClaudeSettings,
  runner?: HookRunner,
): { added: HookEvent[] } => {
  settings.hooks ??= {};
  settings.hooks.PostToolUse ??= [];
  const groups = settings.hooks.PostToolUse;
  const added: HookEvent[] = [];
  for (const event of HOOK_EVENTS) {
    if (hasAtlasHook(groups, event)) continue;
    const same = groups.find((g) => g.matcher === HOOKS[event].matcher)?.hooks;
    if (Array.isArray(same)) same.push(hookCommand(event, runner));
    else groups.push(atlasHookEntry(event, runner));
    added.push(event);
  }
  return { added };
};

// The hand-copied predecessors mix gloss and atlas; once atlas's own hook is in, their
// atlas half is a duplicate the repo should drop.
const legacyHooks = (settings: ClaudeSettings): string[] =>
  (settings.hooks?.PostToolUse ?? [])
    .flatMap((g) => g.hooks ?? [])
    .map((h) => h.command ?? '')
    .filter((c) => /glossAtlasOn(Read|Grep)/.test(c));

const indentOf = (text: string): string | number => {
  const line = text.split('\n').find((l) => /^\s+\S/.test(l));
  if (!line) return 2;
  const lead = /^\s+/.exec(line)?.[0] ?? '';
  return lead.startsWith('\t') ? '\t' : lead.length;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// The merge walks hooks.PostToolUse[].hooks[]; refuse a file whose shape would make
// that walk throw, rather than surfacing a TypeError.
const settingsShapeError = (settings: ClaudeSettings): string | undefined => {
  if (settings.hooks === undefined) return undefined;
  if (!isObject(settings.hooks)) return '"hooks" is not an object';
  const post: unknown = settings.hooks.PostToolUse;
  if (post === undefined) return undefined;
  if (!Array.isArray(post)) return '"hooks.PostToolUse" is not an array';
  for (const group of post as unknown[]) {
    if (!isObject(group)) return 'a "hooks.PostToolUse" entry is not an object';
    if (group.hooks !== undefined && !Array.isArray(group.hooks))
      return 'a "hooks.PostToolUse" entry has a non-array "hooks"';
  }
  return undefined;
};

export type SetupReport = {
  settings: string;
  status: 'created' | 'updated' | 'unchanged' | 'dry-run';
  // with status dry-run: the entries a write would add
  added: HookEvent[];
  notes: string[];
};

export const setupClaudeHooks = (
  root: string,
  options: { write: boolean; version?: string },
): SetupReport => {
  const path = join(root, CLAUDE_SETTINGS);
  const exists = existsSync(path);
  const text = exists ? readFileSync(path, 'utf8') : '';
  let settings: ClaudeSettings;
  try {
    settings = exists && text.trim() !== '' ? (JSON.parse(text) as ClaudeSettings) : {};
  } catch (err) {
    throw new Error(
      `${CLAUDE_SETTINGS} is not valid JSON (${err instanceof Error ? err.message : String(err)}); not touching it`,
    );
  }
  if (!isObject(settings))
    throw new Error(`${CLAUDE_SETTINGS} is not a JSON object; not touching it`);
  const shapeError = settingsShapeError(settings);
  if (shapeError) throw new Error(`${CLAUDE_SETTINGS}: ${shapeError}; not touching it`);

  const notes: string[] = [];
  if (!existsSync(join(root, '.atlas')))
    notes.push(
      'no .atlas/ here yet: the hooks stay silent until one exists (see examples/atlas-config)',
    );
  for (const legacy of legacyHooks(settings))
    notes.push(`legacy hook still configured: ${legacy} (its atlas half duplicates atlas hook)`);

  const { added } = mergeAtlasHooks(settings, runnerFor(root, options.version));
  if (added.length === 0) return { settings: CLAUDE_SETTINGS, status: 'unchanged', added, notes };
  if (!options.write) return { settings: CLAUDE_SETTINGS, status: 'dry-run', added, notes };

  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, exists ? indentOf(text) : 2)}\n`, 'utf8');
  return { settings: CLAUDE_SETTINGS, status: exists ? 'updated' : 'created', added, notes };
};
