import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { runCli } from '../src/cli.ts';
import { graph } from '../src/commands/graph.ts';
import { cachedGraph } from '../src/hook/cachedGraph.ts';
import { runClaudeCodeHook } from '../src/hook/claudeCode.ts';
import {
  findAtlasRoot,
  identifierToken,
  renderConceptMatches,
  renderNeighbourhood,
} from '../src/hook/neighbourhood.ts';

const FIXTURE = resolve(import.meta.dir, 'fixtures/hooks');
const USER_FACTORY = 'src/test/factories/userFactory.ts';
const BUILD_FACTORY = 'src/test/factories/buildFactory.ts';
const CONTROLLER = 'src/modules/users/userController.ts';

const withCacheDir = async (fn: (cacheDir: string) => Promise<void>): Promise<void> => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'atlas-hook-cache-'));
  try {
    await fn(cacheDir);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
};

const contextOf = (output: string): string => {
  const parsed = JSON.parse(output) as {
    suppressOutput: boolean;
    hookSpecificOutput: { hookEventName: string; additionalContext: string };
  };
  expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
  return parsed.hookSpecificOutput.additionalContext;
};

describe('findAtlasRoot', () => {
  test('finds the nearest .atlas above the file, with a posix relPath', () => {
    expect(findAtlasRoot(join(FIXTURE, USER_FACTORY))).toEqual({
      root: FIXTURE,
      relPath: USER_FACTORY,
    });
  });

  test('returns undefined outside any atlas repo', () => {
    expect(findAtlasRoot('/etc/hosts')).toBeUndefined();
  });
});

describe('renderNeighbourhood', () => {
  test('a factory names its kind count, its concept siblings, consumers and its @uses', async () => {
    const g = graph(await analyze(FIXTURE));
    const text = renderNeighbourhood(g, USER_FACTORY);
    expect(text).toBe(
      [
        `atlas neighbourhood of ${USER_FACTORY}:`,
        '',
        'factory, 1 of 2 factories in primitive:testFactories',
        '',
        'primitive:testFactories — 2 other file(s), 1 consumer(s) via @uses; `bunx atlas query --partOf primitive:testFactories` lists all',
        `  ${BUILD_FACTORY}`,
        '  src/test/factories/organizationFactory.ts',
        '',
        '@uses feature:users — load-bearing dependencies; `bunx atlas query --partOf <concept>` shows what implements each',
      ].join('\n'),
    );
  });

  test('a constructor counts constructors in its concept, not factories', async () => {
    const g = graph(await analyze(FIXTURE));
    const text = renderNeighbourhood(g, BUILD_FACTORY) ?? '';
    expect(text).toContain('constructor, 1 of 1 constructors in primitive:testFactories');
    expect(text).not.toContain('factories in');
  });

  test('other kinds get no kind line', async () => {
    const g = graph(await analyze(FIXTURE));
    const text = renderNeighbourhood(g, CONTROLLER) ?? '';
    expect(text).toContain('feature:users — 1 other file(s), 1 consumer(s) via @uses');
    expect(text).not.toContain('controller,');
  });

  test('the reach kinds are overridable', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderNeighbourhood(g, CONTROLLER, { kinds: ['controller'] })).toContain(
      'controller, 1 of 1 controllers in feature:users',
    );
  });

  test('an unannotated or unknown file has no neighbourhood', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderNeighbourhood(g, 'src/nope.ts')).toBeUndefined();
  });
});

describe('renderConceptMatches', () => {
  test('identifierToken takes the longest identifier run of a regex, if long enough', () => {
    expect(identifierToken('make(Controller)\\(')).toBe('Controller');
    expect(identifierToken('foo|ba')).toBeUndefined();
  });

  test('a prefix of a concept name matches, with file count and consumers', async () => {
    const g = graph(await analyze(FIXTURE));
    const text = renderConceptMatches(g, 'testFactor\\w+') ?? '';
    expect(text).toContain('atlas concept(s) matching "testFactor"');
    expect(text).toContain('primitive:testFactories — 3 file(s), 1 consumer(s) via @uses');
    expect(text).toContain(`  ${USER_FACTORY}`);
  });

  test('no concept named by the pattern → nothing', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'somethingElse')).toBeUndefined();
  });
});

describe('cachedGraph', () => {
  test('writes a cache, reuses it, and rebuilds when .atlas/ changes', async () => {
    await withCacheDir(async (cacheDir) => {
      const first = await cachedGraph(FIXTURE, { cacheDir });
      expect(first?.conceptToFiles['primitive:testFactories']?.length).toBe(3);
      const [file] = readdirSync(cacheDir);
      expect(file).toMatch(/^graph-[0-9a-f]+\.json$/);

      const cachePath = join(cacheDir, file as string);
      await Bun.write(cachePath, JSON.stringify({ conceptToFiles: { 'x:cached': [] } }));
      expect(Object.keys((await cachedGraph(FIXTURE, { cacheDir }))?.conceptToFiles ?? {})).toEqual(
        ['x:cached'],
      );

      // A config file newer than the cache invalidates it.
      const concepts = join(FIXTURE, '.atlas/concepts.ts');
      const { atime, mtime } = statSync(concepts);
      try {
        const later = new Date(statSync(cachePath).mtimeMs + 5_000);
        utimesSync(concepts, later, later);
        const rebuilt = await cachedGraph(FIXTURE, { cacheDir });
        expect(rebuilt?.conceptToFiles['x:cached']).toBeUndefined();
      } finally {
        utimesSync(concepts, atime, mtime);
      }
    });
  });

  test('an expired cache is rebuilt', async () => {
    await withCacheDir(async (cacheDir) => {
      await cachedGraph(FIXTURE, { cacheDir });
      const cachePath = join(cacheDir, readdirSync(cacheDir)[0] as string);
      await Bun.write(cachePath, JSON.stringify({ conceptToFiles: { 'x:cached': [] } }));
      // Config older than the cache, cache older than the TTL: only the TTL can expire it.
      const configs = readdirSync(join(FIXTURE, '.atlas')).map((f) => join(FIXTURE, '.atlas', f));
      const saved = configs.map((f) => {
        const { atime, mtime } = statSync(f);
        return { f, atime, mtime };
      });
      try {
        for (const f of configs)
          utimesSync(f, new Date(Date.now() - 20_000), new Date(Date.now() - 20_000));
        utimesSync(cachePath, new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));
        expect(
          (await cachedGraph(FIXTURE, { cacheDir, ttlMs: 60_000 }))?.conceptToFiles['x:cached'],
        ).toEqual([]);
        utimesSync(cachePath, new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));
        expect(
          (await cachedGraph(FIXTURE, { cacheDir, ttlMs: 5_000 }))?.conceptToFiles['x:cached'],
        ).toBeUndefined();
      } finally {
        for (const { f, atime, mtime } of saved) utimesSync(f, atime, mtime);
      }
    });
  });

  test('no .atlas → undefined, no cache written', async () => {
    await withCacheDir(async (cacheDir) => {
      expect(await cachedGraph(tmpdir(), { cacheDir })).toBeUndefined();
      expect(existsSync(cacheDir) ? readdirSync(cacheDir) : []).toEqual([]);
    });
  });
});

describe('runClaudeCodeHook', () => {
  test('read: PostToolUse JSON in, additionalContext out', async () => {
    await withCacheDir(async (cacheDir) => {
      const out = await runClaudeCodeHook(
        'read',
        JSON.stringify({
          tool_name: 'Read',
          tool_input: { file_path: join(FIXTURE, USER_FACTORY) },
        }),
        { cacheDir },
      );
      const parsed = JSON.parse(out) as { suppressOutput: boolean };
      expect(parsed.suppressOutput).toBe(true);
      expect(contextOf(out)).toContain('factory, 1 of 2 factories in primitive:testFactories');
    });
  });

  test('grep: the path anchors the repo lookup relative to cwd', async () => {
    await withCacheDir(async (cacheDir) => {
      const out = await runClaudeCodeHook(
        'grep',
        JSON.stringify({
          cwd: resolve(FIXTURE, '..'),
          tool_input: { pattern: 'routeTemplate', path: 'hooks/src' },
        }),
        { cacheDir },
      );
      expect(contextOf(out)).toContain('primitive:routeTemplates — 1 file(s), 2 consumer(s)');
    });
  });

  test('fails silently: bad JSON, no file, a file outside any repo', async () => {
    await withCacheDir(async (cacheDir) => {
      expect(await runClaudeCodeHook('read', 'not json', { cacheDir })).toBe('');
      expect(await runClaudeCodeHook('read', '{}', { cacheDir })).toBe('');
      expect(
        await runClaudeCodeHook(
          'read',
          JSON.stringify({ tool_input: { file_path: '/etc/hosts' } }),
          {
            cacheDir,
          },
        ),
      ).toBe('');
      expect(
        await runClaudeCodeHook(
          'grep',
          JSON.stringify({ cwd: FIXTURE, tool_input: { pattern: 'ab' } }),
          { cacheDir },
        ),
      ).toBe('');
    });
  });
});

describe('atlas hook (CLI)', () => {
  test('hook read prints the hook JSON from stdin', async () => {
    const stdin = JSON.stringify({ tool_input: { file_path: join(FIXTURE, USER_FACTORY) } });
    const { code, out } = await runCli(['hook', 'read'], {
      cwd: FIXTURE,
      stdin: async () => stdin,
    });
    expect(code).toBe(0);
    expect(contextOf(out)).toContain(`atlas neighbourhood of ${USER_FACTORY}`);
  });

  test('hook with nothing to say prints nothing and exits 0', async () => {
    const { code, out } = await runCli(['hook', 'read'], { cwd: FIXTURE, stdin: async () => '' });
    expect(code).toBe(0);
    expect(out).toBe('');
  });

  test('an unknown hook event is a usage error', async () => {
    const { code, out } = await runCli(['hook', 'write'], { cwd: FIXTURE });
    expect(code).toBe(1);
    expect(out).toContain('read | grep');
  });

  test('the real bin reads stdin and writes the hook JSON', () => {
    const result = Bun.spawnSync(
      ['bun', resolve(import.meta.dir, '../bin/atlas.ts'), 'hook', 'read'],
      {
        stdin: Buffer.from(
          JSON.stringify({ tool_input: { file_path: join(FIXTURE, USER_FACTORY) } }),
        ),
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(result.exitCode).toBe(0);
    expect(contextOf(result.stdout.toString().trim())).toContain('primitive:testFactories');
  });
});
