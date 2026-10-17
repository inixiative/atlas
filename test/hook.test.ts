import { afterAll, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
} from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { runCli } from '../src/cli.ts';
import { type Graph, graph } from '../src/commands/graph.ts';
import { hookCommandFor } from '../src/commands/setup.ts';
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

// Paths that don't pass a cacheDir (the CLI, the spawned bin) get an isolated one, so a
// graph cached by an earlier run never answers for edited fixtures.
const SHARED_CACHE = mkdtempSync(join(tmpdir(), 'atlas-hook-shared-'));
process.env.ATLAS_HOOK_CACHE_DIR = SHARED_CACHE;
afterAll(() => rmSync(SHARED_CACHE, { recursive: true, force: true }));

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
    expect(text).toContain('atlas concept(s) matching "testFactor\\w+"');
    expect(text).toContain('primitive:testFactories — 3 file(s), 1 consumer(s) via @uses');
    expect(text).toContain(`  ${USER_FACTORY}`);
  });

  test('no concept named by the pattern → nothing', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'somethingElse')).toBeUndefined();
  });
});

describe('renderConceptMatches — thesaurus', () => {
  const thesaurusBlock = (word: string) =>
    [
      `primitive:testFactories (thesaurus "${word}") — 3 file(s), 1 consumer(s) via @uses; \`bunx atlas query --partOf primitive:testFactories\` lists all`,
      '  read: docs/TESTING.md#factories',
      '  src/test/factories/buildFactory.ts',
      '  src/test/factories/organizationFactory.ts',
      `  ${USER_FACTORY}`,
    ].join('\n');

  test('a phrase hit renders the concept block, labelled with the thesaurus word', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'seed a user')).toBe(
      ['atlas concept(s) matching "seed a user":', '', thesaurusBlock('seed a user')].join('\n'),
    );
  });

  test('a phrase matches a regex over it, and an identifier made of its words', async () => {
    const g = graph(await analyze(FIXTURE));
    for (const pattern of ['seed.*user', 'seed\\s+(a\\s+)?user', 'seedUser\\(', '\\bseed_user\\b'])
      expect(renderConceptMatches(g, pattern)).toContain(thesaurusBlock('seed a user'));
  });

  test('matching is case-insensitive both ways', async () => {
    const g = graph(await analyze(FIXTURE));
    for (const pattern of ['make a controller', 'MAKE.*CONTROLLER', 'makeController'])
      expect(renderConceptMatches(g, pattern)).toContain(
        'primitive:routeTemplates (thesaurus "Make A Controller") — 1 file(s), 2 consumer(s) via @uses',
      );
  });

  test('a single word matches only as a whole word', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'loadFixture')).toContain(thesaurusBlock('fixture'));
    expect(renderConceptMatches(g, 'fixtures?')).toContain(thesaurusBlock('fixture'));
    expect(renderConceptMatches(g, 'fixtur(e|es)')).toContain(thesaurusBlock('fixture'));
    expect(renderConceptMatches(g, 'fixtureless')).toBeUndefined();
    expect(renderConceptMatches(g, 'seed')).toBeUndefined();
  });

  test('a regex with no literal word of its own matches no phrase', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, '.*')).toBeUndefined();
    expect(renderConceptMatches(g, '[a-z ]+')).toBeUndefined();
  });

  test('a wildcard alternative does not list the whole thesaurus', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'nothing|.*')).toBeUndefined();
    const text = renderConceptMatches(g, 'lock|.+') ?? '';
    expect(text).toContain('primitive:routeTemplates (thesaurus "lock")');
    expect(text).not.toContain('thesaurus "seed a user"');
  });

  test('alternatives are read apart: seed|user is not the phrase "seed a user"', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'seed|user')).toBeUndefined();
    expect(renderConceptMatches(g, 'foo|seedUser')).toContain('thesaurus "seed a user"');
  });

  test('whole words, however the identifier splits them', async () => {
    const g = graph(await analyze(FIXTURE));
    const users = (word: string) => `feature:users (thesaurus "${word}") — 2 file(s)`;
    expect(renderConceptMatches(g, 'acquireLock')).toContain('(thesaurus "lock")');
    expect(renderConceptMatches(g, 'unlock')).toBeUndefined();
    expect(renderConceptMatches(g, 'lockfile')).toBeUndefined();
    for (const pattern of ['github', 'createGitHubClient', 'GITHUB_TOKEN'])
      expect(renderConceptMatches(g, pattern)).toContain(users('GitHub'));
    expect(renderConceptMatches(g, 'OAuthProvider')).toContain(users('oauth'));
  });

  test('conjugations: plural, -ing, -ed, -er, a dropped e, y to ies', async () => {
    const g = graph(await analyze(FIXTURE));
    const lock = '(thesaurus "lock")';
    for (const pattern of ['locks', 'locking', 'locked', 'locker', 'acquireLocks', 'LOCKED_ROWS'])
      expect(renderConceptMatches(g, pattern)).toContain(lock);
    const serialize = '(thesaurus "serialize")';
    for (const pattern of ['serializes', 'serializing', 'serialized', 'serializer'])
      expect(renderConceptMatches(g, pattern)).toContain(serialize);
    expect(renderConceptMatches(g, 'seedingUsers')).toContain(thesaurusBlock('seed a user'));
    expect(renderConceptMatches(g, 'seeded_user')).toContain(thesaurusBlock('seed a user'));
    expect(renderConceptMatches(g, 'fixtures')).toContain(thesaurusBlock('fixture'));
    expect(renderConceptMatches(g, 'listDirectories')).toContain('(thesaurus "directory")');
  });

  test('conjugations stay whole-word and suffix-only', async () => {
    const g = graph(await analyze(FIXTURE));
    for (const pattern of ['unlocked', 'blocking', 'serial', 'serializable', 'lockless'])
      expect(renderConceptMatches(g, pattern)).toBeUndefined();
  });

  test('a hit points at the doc: its own with a section, else the concept docs entry, else none', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'seed a user')).toContain('  read: docs/TESTING.md#factories\n');
    expect(renderConceptMatches(g, 'lock')).toContain(
      '— 1 file(s), 2 consumer(s) via @uses; `bunx atlas query --partOf primitive:routeTemplates` lists all\n  read: docs/ROUTES.md\n  src/routes/makeController.ts',
    );
    expect(renderConceptMatches(g, 'oauth')).not.toContain('read:');
  });

  test('a final consonant doubles; a 3-letter word keeps its e before -er', async () => {
    const g = graph(await analyze(FIXTURE));
    for (const pattern of ['logging', 'logger', 'logged', 'stopped', 'stopping'])
      expect(renderConceptMatches(g, pattern)).toContain('primitive:routeTemplates (thesaurus');
    for (const pattern of ['using', 'used', 'uses'])
      expect(renderConceptMatches(g, pattern)).toContain('(thesaurus "use")');
    for (const pattern of ['user', 'userId', 'createUser\\('])
      expect(renderConceptMatches(g, pattern) ?? '').not.toContain('(thesaurus "use")');
  });

  test('an escaped paren or bar is a literal, not an alternative boundary', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'seed\\(user')).toContain('(thesaurus "seed a user")');
    expect(renderConceptMatches(g, 'seed\\|user')).toContain('(thesaurus "seed a user")');
  });

  test('a phrase listed twice in one entry is labelled once', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, 'fixture')).toBe(
      ['atlas concept(s) matching "fixture":', '', thesaurusBlock('fixture')].join('\n'),
    );
  });

  test('patterns JavaScript cannot run as given fall back to the word reading', async () => {
    const g = graph(await analyze(FIXTURE));
    expect(renderConceptMatches(g, '(')).toBeUndefined();
    expect(renderConceptMatches(g, 'seed)|(user')).toBeUndefined();
    expect(renderConceptMatches(g, '(?i)lock')).toContain('(thesaurus "lock")');
    // nested quantifiers skip the regex reading rather than risk backtracking
    expect(renderConceptMatches(g, '(\\w+\\s?)+user')).toBeUndefined();
  });

  test('thesaurus hits come first; a concept-name hit it already showed is not repeated', async () => {
    const g = graph(await analyze(FIXTURE));
    const text = renderConceptMatches(g, 'routeTemplates|fixture') ?? '';
    expect(text.indexOf('primitive:testFactories (thesaurus "fixture")')).toBeLessThan(
      text.indexOf('primitive:routeTemplates —'),
    );
    expect(
      renderConceptMatches(g, 'testFactories|fixture')?.match(/primitive:testFactories/g),
    ).toEqual(
      ['primitive:testFactories', 'primitive:testFactories'], // the block's line + its query hint
    );
  });

  // A synthetic map: many concepts, many phrases, as a large repo's thesaurus would be.
  const wideGraph = (concepts: number, phrases: string[]): Graph => ({
    conceptToFiles: {},
    usesConsumers: {},
    fileToConcepts: {},
    docToConcepts: {},
    thesaurus: Object.fromEntries(
      Array.from({ length: concepts }, (_, i) => [`primitive:c${i}`, { phrases }]),
    ),
  });

  test('at most 8 thesaurus concepts render, then a count of the rest', () => {
    const text = renderConceptMatches(wideGraph(10, ['lock']), 'lock') ?? '';
    expect(text.match(/\(thesaurus "lock"\)/g)?.length).toBe(8);
    expect(text).toContain('… 2 more concept(s) via the thesaurus; narrow the pattern');
  });

  test('the regex reading needs a pattern literal at the start of a phrase word', () => {
    const g = wideGraph(1, ['unlock the door', 'lock the door']);
    expect(renderConceptMatches(g, 'lock|.*')).toContain('(thesaurus "lock the door")');
    expect(renderConceptMatches(g, 'lock|.*')).not.toContain('unlock');
  });

  test('a long pattern stays fast and its quote in the header is clipped', () => {
    const g = wideGraph(300, ['seed a user', 'lock', 'make a controller', 'serialize', 'log']);
    const pattern = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
    const started = performance.now();
    expect(renderConceptMatches(g, pattern)).toBeUndefined();
    expect(renderConceptMatches(g, `${'x'.repeat(100)}|lock`)).toContain(
      `matching "${'x'.repeat(80)}…"`,
    );
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  test('no thesaurus or concept match → the hook prints nothing', async () => {
    await withCacheDir(async (cacheDir) => {
      const out = await runClaudeCodeHook(
        'grep',
        JSON.stringify({ cwd: FIXTURE, tool_input: { pattern: 'invoice the customer' } }),
        { cacheDir },
      );
      expect(out).toBe('');
    });
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

  test('an edit to .atlas/thesaurus.ts invalidates the cache', async () => {
    await withCacheDir(async (cacheDir) => {
      await cachedGraph(FIXTURE, { cacheDir });
      const cachePath = join(cacheDir, readdirSync(cacheDir)[0] as string);
      await Bun.write(cachePath, JSON.stringify({ conceptToFiles: { 'x:cached': [] } }));
      const thesaurus = join(FIXTURE, '.atlas/thesaurus.ts');
      const { atime, mtime } = statSync(thesaurus);
      try {
        const later = new Date(statSync(cachePath).mtimeMs + 5_000);
        utimesSync(thesaurus, later, later);
        const rebuilt = await cachedGraph(FIXTURE, { cacheDir });
        expect(rebuilt?.conceptToFiles['x:cached']).toBeUndefined();
        expect(rebuilt?.thesaurus['primitive:testFactories']?.phrases).toContain('seed a user');
      } finally {
        utimesSync(thesaurus, atime, mtime);
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

  test('grep: a thesaurus phrase reaches the agent through the hook', async () => {
    await withCacheDir(async (cacheDir) => {
      const out = await runClaudeCodeHook(
        'grep',
        JSON.stringify({ cwd: FIXTURE, tool_input: { pattern: 'seed.*user' } }),
        { cacheDir },
      );
      expect(contextOf(out)).toContain('primitive:testFactories (thesaurus "seed a user")');
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

  test('the installed command setup writes runs through a .bin symlink, silent when absent', () => {
    const project = mkdtempSync(join(tmpdir(), 'atlas-hook-project-'));
    try {
      const run = () =>
        Bun.spawnSync(['sh', '-c', hookCommandFor('read')], {
          stdin: Buffer.from(
            JSON.stringify({ tool_input: { file_path: join(FIXTURE, USER_FACTORY) } }),
          ),
          stdout: 'pipe',
          stderr: 'pipe',
          env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: project,
            PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`,
          },
        });

      const absent = run();
      expect(absent.exitCode).toBe(0);
      expect(absent.stdout.toString()).toBe('');
      expect(absent.stderr.toString()).toBe('');

      mkdirSync(join(project, 'node_modules/.bin'), { recursive: true });
      symlinkSync(
        resolve(import.meta.dir, '../bin/atlas.ts'),
        join(project, 'node_modules/.bin/atlas'),
      );
      const present = run();
      expect(present.exitCode).toBe(0);
      expect(contextOf(present.stdout.toString().trim())).toContain('primitive:testFactories');
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
