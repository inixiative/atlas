import { join, resolve } from 'node:path';
import { type CachedGraphOptions, cachedGraph } from './cachedGraph.ts';
import { findAtlasRoot, renderConceptMatches, renderNeighbourhood } from './neighbourhood.ts';

// Claude Code adapter: PostToolUse stdin JSON in, `hookSpecificOutput.additionalContext`
// out. The core (neighbourhood.ts) stays harness-agnostic; only this file knows Claude.

export type HookEvent = 'read' | 'grep';
export const HOOK_EVENTS: readonly HookEvent[] = ['read', 'grep'];

type PostToolUseInput = {
  cwd?: string;
  tool_input?: { file_path?: string; pattern?: string; path?: string };
};

const MAX_CHARS = 8000;

export const toAdditionalContext = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === '') return '';
  const body =
    trimmed.length > MAX_CHARS
      ? `${trimmed.slice(0, MAX_CHARS)}\n… (truncated; run the command above for the rest)`
      : trimmed;
  return JSON.stringify({
    suppressOutput: true,
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: body },
  });
};

const contextFor = async (
  event: HookEvent,
  input: PostToolUseInput,
  cache: CachedGraphOptions,
): Promise<string | undefined> => {
  if (event === 'read') {
    const filePath = input.tool_input?.file_path;
    if (!filePath) return undefined;
    const location = findAtlasRoot(filePath);
    if (!location) return undefined;
    const g = await cachedGraph(location.root, cache);
    return g && renderNeighbourhood(g, location.relPath);
  }
  const pattern = input.tool_input?.pattern;
  if (!pattern) return undefined;
  const cwd = input.cwd ?? process.cwd();
  const anchor = input.tool_input?.path ? resolve(cwd, input.tool_input.path) : cwd;
  // Probe a child of the anchor so a directory anchor's own `.atlas/` is found.
  const location = findAtlasRoot(join(anchor, '__atlas_probe__'));
  if (!location) return undefined;
  const g = await cachedGraph(location.root, cache);
  return g && renderConceptMatches(g, pattern);
};

// Never throws: a hook that errors surfaces on every Read/Grep, so silence is the
// failure mode. Set ATLAS_HOOK_DEBUG to see the error on stderr.
export const runClaudeCodeHook = async (
  event: HookEvent,
  stdin: string,
  cache: CachedGraphOptions = {},
): Promise<string> => {
  try {
    const input = JSON.parse(stdin) as PostToolUseInput;
    return toAdditionalContext((await contextFor(event, input, cache)) ?? '');
  } catch (error) {
    if (process.env.ATLAS_HOOK_DEBUG) console.error(error);
    return '';
  }
};
