import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { runCli } from '../src/cli.ts';
import { runCheck } from '../src/commands/check.ts';
import { detectLanguages } from '../src/commands/init.ts';
import { runClaudeCodeHook } from '../src/hook/claudeCode.ts';
import { parseAtlasBlock } from '../src/parse/parseAtlasBlock.ts';
import { applyStamp } from '../src/stamp/patcher.ts';
import {
  type CommentStyle,
  mergeCommentTable,
  preambleEnd,
  styleFor,
  styleNameFor,
} from '../src/syntax/comments.ts';

const styleOf = (path: string): CommentStyle => {
  const style = styleFor(path);
  if (!style) throw new Error(`no style for ${path}`);
  return style;
};

const tags = { kind: ['service'], partOf: ['feature:billing'] };

// Each case: a file with no block yet, what must stay above the block, and the block as written.
const CASES: { path: string; source: string; keepsFirst?: string; block: string }[] = [
  {
    path: 'src/charge.ts',
    source: "import { x } from 'y';\n",
    block: '/**\n * @atlas\n * @kind service\n * @partOf feature:billing\n */',
  },
  {
    path: 'svc/main.go',
    source: 'package main\n',
    block: '/**\n * @atlas\n * @kind service\n * @partOf feature:billing\n */',
  },
  {
    path: 'tool/run.py',
    source: '#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\nimport os\n',
    keepsFirst: '#!/usr/bin/env python3\n# -*- coding: utf-8 -*-\n',
    block: '# @atlas\n# @kind service\n# @partOf feature:billing',
  },
  {
    path: 'lib/task.rb',
    source: "# frozen_string_literal: true\nrequire 'json'\n",
    block: '# @atlas\n# @kind service\n# @partOf feature:billing',
  },
  {
    path: 'db/schema.sql',
    source: 'CREATE TABLE invoice (id int);\n',
    block: '-- @atlas\n-- @kind service\n-- @partOf feature:billing',
  },
  {
    path: 'docs/guide.md',
    source: '---\ntitle: Guide\ntags: [a]\n---\n# Guide\n',
    keepsFirst: '---\ntitle: Guide\ntags: [a]\n---\n',
    block: '<!--\n@atlas\n@kind service\n@partOf feature:billing\n-->',
  },
  {
    path: 'docs/README.md',
    source: '# Readme\n\nText.\n',
    block: '<!--\n@atlas\n@kind service\n@partOf feature:billing\n-->',
  },
  {
    path: '.github/workflows/ci.yml',
    source: 'name: ci\non: push\n',
    block: '# @atlas\n# @kind service\n# @partOf feature:billing',
  },
  {
    path: 'scripts/deploy.sh',
    source: '#!/bin/sh\nset -e\n',
    keepsFirst: '#!/bin/sh\n',
    block: '# @atlas\n# @kind service\n# @partOf feature:billing',
  },
  {
    path: 'infra/Dockerfile',
    source: '# syntax=docker/dockerfile:1\n# escape=`\nFROM oven/bun\n',
    keepsFirst: '# syntax=docker/dockerfile:1\n# escape=`\n',
    block: '# @atlas\n# @kind service\n# @partOf feature:billing',
  },
  {
    path: 'web/index.php',
    source: '<?php\necho 1;\n',
    keepsFirst: '<?php\n',
    block: '/**\n * @atlas\n * @kind service\n * @partOf feature:billing\n */',
  },
  {
    path: 'web/site.css',
    source: '@charset "utf-8";\nbody {}\n',
    keepsFirst: '@charset "utf-8";\n',
    block: '/**\n * @atlas\n * @kind service\n * @partOf feature:billing\n */',
  },
  {
    path: 'conf/app.xml',
    source: '<?xml version="1.0"?>\n<app/>\n',
    keepsFirst: '<?xml version="1.0"?>\n',
    block: '<!--\n@atlas\n@kind service\n@partOf feature:billing\n-->',
  },
  {
    path: 'docs/index.rst',
    source: '\nTitle\n=====\n',
    block: '.. @atlas\n.. @kind service\n.. @partOf feature:billing',
  },
  {
    path: 'src/core.clj',
    source: '(ns core)\n',
    block: '; @atlas\n; @kind service\n; @partOf feature:billing',
  },
];

describe('stamp → parse round trip, per language', () => {
  for (const { path, source, keepsFirst, block } of CASES) {
    test(path, () => {
      const file = { path, style: styleOf(path) };
      const { content, changed } = applyStamp(source, tags, file);
      expect(changed).toBe(true);
      expect(content).toBe(`${keepsFirst ?? ''}${block}\n${source.slice(keepsFirst?.length ?? 0)}`);
      const parsed = parseAtlasBlock(content, file.style);
      expect(parsed?.kind).toEqual(['service']);
      expect(parsed?.partOf).toEqual(['feature:billing']);
      // idempotent: the same tags again change nothing
      expect(applyStamp(content, tags, file).changed).toBe(false);
      // an additive fill rewrites the block in place, in the same style
      const filled = applyStamp(content, { partOf: ['primitive:jobs'] }, file).content;
      expect(parseAtlasBlock(filled, file.style)?.partOf).toEqual([
        'feature:billing',
        'primitive:jobs',
      ]);
      expect(filled.startsWith(keepsFirst ?? '')).toBe(true);
    });
  }

  test('reST gets a blank line after a fresh block (docutils warns without one)', () => {
    const file = { path: 'a.rst', style: styleOf('a.rst') };
    const { content } = applyStamp('Title\n=====\n', tags, file);
    expect(content).toBe(
      '.. @atlas\n.. @kind service\n.. @partOf feature:billing\n\nTitle\n=====\n',
    );
    expect(applyStamp(content, tags, file).changed).toBe(false);
  });

  test('a CRLF Python file keeps CRLF', () => {
    const file = { path: 'a.py', style: styleOf('a.py') };
    const { content } = applyStamp('import os\r\n', tags, file);
    expect(content).toBe(
      '# @atlas\r\n# @kind service\r\n# @partOf feature:billing\r\nimport os\r\n',
    );
    expect(parseAtlasBlock(content, file.style)?.partOf).toEqual(['feature:billing']);
    expect(applyStamp(content, tags, file).changed).toBe(false);
  });
});

describe('line-comment blocks', () => {
  const hash = styleOf('a.py');

  test('a block is the @atlas line and the axis lines right after it; prose stays out', () => {
    const source =
      '# Billing helpers.\n# @atlas\n# @kind service\n# @uses primitive:jobs\n#\n# Charges cards.\nx = 1\n';
    const parsed = parseAtlasBlock(source, hash);
    expect(parsed?.kind).toEqual(['service']);
    expect(parsed?.uses).toEqual(['primitive:jobs']);
    const { content } = applyStamp(
      source,
      { partOf: ['feature:billing'] },
      { path: 'a.py', style: hash },
    );
    expect(content).toBe(
      '# Billing helpers.\n# @atlas\n# @kind service\n# @partOf feature:billing\n# @uses primitive:jobs\n#\n# Charges cards.\nx = 1\n',
    );
  });

  test('`#` lines inside strings or code are not comment lines', () => {
    expect(parseAtlasBlock('x = "# @atlas"\n', hash)).toBeNull();
  });

  test('indented line comments count; a shebang is never part of a block', () => {
    expect(parseAtlasBlock('  # @atlas\n  # @kind job\n', hash)?.kind).toEqual(['job']);
    expect(parseAtlasBlock('#!/bin/sh\n', hash)).toBeNull();
  });

  test('pin and tentative @uses? read the same as in a C block', () => {
    const parsed = parseAtlasBlock(
      '-- @atlas pin\n-- @uses? infrastructure:postgres\n',
      styleOf('a.sql'),
    );
    expect(parsed?.pinned).toBe(true);
    expect(parsed?.usesState).toBe('proposed');
  });
});

describe('block-comment blocks', () => {
  test('a block a formatter collapsed onto one line does not parse (check reports it)', () => {
    expect(parseAtlasBlock('/** * @atlas * @kind route */\nx;\n', styleOf('a.ts'))).toBeNull();
  });

  test('an HTML comment in Markdown is found after front matter and prose', () => {
    const md = '---\na: 1\n---\n# T\n\n<!--\n@atlas\n@kind page\n-->\n';
    expect(parseAtlasBlock(md, styleOf('a.md'))?.kind).toEqual(['page']);
  });
});

describe('the comment table', () => {
  test('groups files by comment style; exact names beat extensions', () => {
    expect(styleNameFor('a/b.tsx')).toBe('c');
    expect(styleNameFor('Makefile')).toBe('hash');
    expect(styleNameFor('ops/Dockerfile')).toBe('hash');
    expect(styleNameFor('q.sql')).toBe('dash');
    expect(styleNameFor('n.mdx')).toBe('html');
    expect(styleNameFor('data.json')).toBeNull();
    expect(styleNameFor('notes.txt')).toBeNull();
    expect(styleNameFor('.ts')).toBeNull(); // a dotfile named like an extension isn't one
  });

  test('a repo can add files to a style, or move one to another', () => {
    const table = mergeCommentTable({ hash: ['.nix2', 'Tiltfile'], c: ['.toml'] });
    expect(styleNameFor('x.nix2', table)).toBe('hash');
    expect(styleNameFor('Tiltfile', table)).toBe('hash');
    expect(styleNameFor('x.toml', table)).toBe('c');
  });

  test('preambleEnd only skips what must stay first', () => {
    expect(preambleEnd('a.ts', '#!/usr/bin/env bun\nx\n')).toBe(19);
    expect(preambleEnd('a.ts', 'x\n#!/usr/bin/env bun\n')).toBe(0);
    expect(preambleEnd('a.yml', '---\na: 1\n---\n')).toBe(0); // front matter is Markdown's
  });
});

// A throwaway repo on disk: files by path, then the test.
const withRepo = async (
  files: Record<string, string | Uint8Array>,
  fn: (root: string) => Promise<void>,
  options: { git?: boolean; nestedRepos?: string[] } = {},
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-langs-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    if (options.git) {
      const git = (...args: string[]) =>
        Bun.spawnSync(['git', ...args], { cwd: root, stdout: 'ignore', stderr: 'ignore' });
      // a nested checkout (a worktree under .worktrees/) is its own repo
      for (const dir of options.nestedRepos ?? [])
        Bun.spawnSync(['git', 'init', '-q'], { cwd: join(root, dir) });
      git('init', '-q');
      git('add', '-A');
    }
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const CONFIG = `import { defineConfig, partOfFor } from '@inixiative/atlas/config';
export default defineConfig({
  stamp: [
    { include: 'billing/**', partOf: partOfFor('area', 'billing') },
    { include: 'notes/*.txt', kind: 'config', partOf: 'feature:billing' },
    { include: '**/*.py', kind: 'service' },
  ],
});
`;
const CONCEPTS = `import type { ConceptRegistry } from '@inixiative/atlas';
export const CONCEPTS: ConceptRegistry = { 'feature:billing': { area: ['billing'] } };
`;

describe('a mixed-language repo', () => {
  test('default include: known styles plus path-tagged files; stamp then check is clean', async () => {
    await withRepo(
      {
        '.atlas/config.ts': CONFIG,
        '.atlas/concepts.ts': CONCEPTS,
        'billing/charge.py': 'import os\n',
        'billing/schema.sql': 'select 1;\n',
        'billing/README.md': '# Billing\n',
        'notes/plan.txt': 'plain text, never edited\n',
        'notes/data.json': '{}\n', // no style and no rule: not considered
        '.github/workflows/ci.yml': 'name: ci\n',
      },
      async (root) => {
        const before = await analyze(root);
        expect(before.files.map((f) => f.path)).toEqual([
          '.github/workflows/ci.yml',
          'billing/README.md',
          'billing/charge.py',
          'billing/schema.sql',
          'notes/plan.txt',
        ]);
        const stamp = await runCli(['stamp', '--write', '--root', root], { cwd: root });
        expect(stamp.code).toBe(0);
        expect(await Bun.file(join(root, 'billing/charge.py')).text()).toBe(
          '# @atlas\n# @kind service\n# @partOf feature:billing\nimport os\n',
        );
        expect(await Bun.file(join(root, 'notes/plan.txt')).text()).toBe(
          'plain text, never edited\n',
        );

        const after = await analyze(root);
        const byPath = Object.fromEntries(after.files.map((f) => [f.path, f]));
        expect(byPath['notes/plan.txt']?.tagging).toBe('path');
        expect(byPath['notes/plan.txt']?.annotation?.partOf).toEqual(['feature:billing']);
        // ci.yml has no rule, so it needs a hand-written block
        const problems = (await runCheck(after)).problems;
        expect(problems).toEqual([
          { kind: 'presence', file: '.github/workflows/ci.yml', message: 'missing @atlas block' },
        ]);

        const graph = JSON.parse(
          (await runCli(['graph', '--json', '--root', root], { cwd: root })).out,
        ) as { conceptToFiles: Record<string, string[]> };
        expect(graph.conceptToFiles['feature:billing']).toEqual([
          'billing/README.md',
          'billing/charge.py',
          'billing/schema.sql',
          'notes/plan.txt',
        ]);
      },
    );
  });

  test('a file with no comment style in an explicit include needs a rule', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { include: ['**/*.json'] };\n`,
        'a.json': '{}\n',
      },
      async (root) => {
        const { problems } = await runCheck(await analyze(root));
        expect(problems).toEqual([
          {
            kind: 'presence',
            file: 'a.json',
            message: 'no comment style for this file and no stamp rule tags its path',
          },
        ]);
      },
    );
  });

  test('in a git repo: ignored files and nested worktrees are skipped, new files are seen', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { include: ['**/*.py'] };\n`,
        '.gitignore': 'build/\n',
        'app.py': '# @atlas\n',
        'build/out.py': 'x\n',
        '.worktrees/feature/app.py': 'x\n',
      },
      async (root) => {
        writeFileSync(join(root, 'new.py'), 'x\n'); // untracked, not ignored
        const paths = (await analyze(root)).files.map((f) => f.path);
        expect(paths).toEqual(['app.py', 'new.py']);
      },
      { git: true, nestedRepos: ['.worktrees/feature'] },
    );
  });

  test('a file named like source but holding binary is not read', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { include: ['**/*.ts'] };\n`,
        'clip.ts': new Uint8Array([0x47, 0x00, 0x11, 0x10]),
        'a.ts': '/**\n * @atlas\n */\n',
      },
      async (root) => {
        expect((await analyze(root)).files.map((f) => f.path)).toEqual(['a.ts']);
      },
    );
  });

  test('`comments` in config adds a file to a style; an unknown style is refused', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { include: ['Tiltfile'], comments: { hash: ['Tiltfile'] } };\n`,
        Tiltfile: '# @atlas\n# @kind config\n',
      },
      async (root) => {
        const [file] = (await analyze(root)).files;
        expect(file?.annotation?.kind).toEqual(['config']);
      },
    );
    await withRepo(
      { '.atlas/config.ts': `export default { comments: { pound: ['.x'] } };\n` },
      async (root) => {
        const result = await runCli(['check', '--root', root], { cwd: root });
        expect(result.code).toBe(1);
        expect(result.out).toContain('comments.pound is not a comment style');
      },
    );
  });

  test('the read hook shows a Python file its neighbourhood', async () => {
    await withRepo(
      {
        '.atlas/config.ts': CONFIG,
        '.atlas/concepts.ts': CONCEPTS,
        'billing/charge.py': '# @atlas\n# @partOf feature:billing\n',
        'billing/refund.py': '# @atlas\n# @partOf feature:billing\n',
      },
      async (root) => {
        const cacheDir = join(root, '.cache-test');
        const out = await runClaudeCodeHook(
          'read',
          JSON.stringify({ tool_input: { file_path: join(root, 'billing/charge.py') } }),
          { cacheDir },
        );
        const context = (JSON.parse(out) as { hookSpecificOutput: { additionalContext: string } })
          .hookSpecificOutput.additionalContext;
        expect(context).toContain('atlas neighbourhood of billing/charge.py');
        expect(context).toContain('billing/refund.py');
      },
    );
  });
});

describe('atlas init', () => {
  test('detects languages, writes a starter .atlas/, and its config loads with no node_modules', async () => {
    await withRepo(
      {
        'pkg/a.py': 'x\n',
        'pkg/b.py': 'x\n',
        'docs/README.md': '# r\n',
        Makefile: 'all:\n',
        'data.json': '{}\n',
      },
      async (root) => {
        expect(await detectLanguages(root)).toEqual([
          { entry: '.py', style: 'hash', files: 2 },
          { entry: '.md', style: 'html', files: 1 },
          { entry: 'Makefile', style: 'hash', files: 1 },
        ]);
        const result = await runCli(['init', '--root', root], { cwd: root });
        expect(result.code).toBe(0);
        expect(result.out).toContain('wrote .atlas/config.ts, .atlas/kinds.ts, .atlas/concepts.ts');
        const config = await Bun.file(join(root, '.atlas/config.ts')).text();
        expect(config).toContain("'**/*.py', // 2 file(s), hash comments");
        expect(config).toContain("'**/Makefile'");

        // the generated files import @inixiative/atlas; the loader binds that to this atlas
        const coverage = await runCli(['coverage', '--json', '--root', root], { cwd: root });
        expect(coverage.code).toBe(0);
        expect((JSON.parse(coverage.out) as { total: number }).total).toBe(4);

        const again = await runCli(['init', '--root', root], { cwd: root });
        expect(again.code).toBe(1);
        expect(again.out).toContain('already exists');
      },
    );
  });
});
