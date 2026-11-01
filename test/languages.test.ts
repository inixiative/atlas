import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { runCli } from '../src/cli.ts';
import { runCheck } from '../src/commands/check.ts';
import { detectLanguages } from '../src/commands/init.ts';
import { buildCoverageReport } from '../src/commands/report.ts';
import { bindAtlasImports } from '../src/config/load.ts';
import { cachedGraph } from '../src/hook/cachedGraph.ts';
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
    // plain `/*`, and a blank line: a comment touching `package` is the package doc
    path: 'svc/main.go',
    source: '\npackage main\n',
    block: '/*\n * @atlas\n * @kind service\n * @partOf feature:billing\n */',
  },
  {
    // `/**` is a doc comment in Rust (E0753 before `//!`); `#![` is not a shebang
    path: 'crate/lib.rs',
    source: '#![allow(dead_code)]\n//! Crate docs.\npub fn f() {}\n',
    block: '/*\n * @atlas\n * @kind service\n * @partOf feature:billing\n */',
  },
  {
    path: 'docs/page.mdx',
    source: '---\ntitle: P\n---\n# P\n',
    keepsFirst: '---\ntitle: P\n---\n',
    block: '{/*\n@atlas\n@kind service\n@partOf feature:billing\n*/}',
  },
  {
    path: 'src/main.zig',
    source: 'const std = @import("std");\n',
    block: '// @atlas\n// @kind service\n// @partOf feature:billing',
  },
  {
    path: 'lib/legacy.rb',
    source: '# encoding: ascii-8bit\nputs 1\n',
    keepsFirst: '# encoding: ascii-8bit\n',
    block: '# @atlas\n# @kind service\n# @partOf feature:billing',
  },
  {
    path: 'lisp/mode.el',
    source: ';;; mode.el --- a mode -*- lexical-binding: t -*-\n(provide (quote mode))\n',
    keepsFirst: ';;; mode.el --- a mode -*- lexical-binding: t -*-\n',
    block: ';; @atlas\n;; @kind service\n;; @partOf feature:billing',
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
    block: '/*\n * @atlas\n * @kind service\n * @partOf feature:billing\n */',
  },
  {
    path: 'web/site.css',
    source: '@charset "utf-8";\nbody {}\n',
    keepsFirst: '@charset "utf-8";\n',
    block: '/*\n * @atlas\n * @kind service\n * @partOf feature:billing\n */',
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
    block: ';; @atlas\n;; @kind service\n;; @partOf feature:billing',
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

describe('placement rules', () => {
  const at = (path: string) => ({ path, style: styleOf(path) });

  test('Go: a blank line keeps the block from becoming the package doc', () => {
    expect(applyStamp('package main\n', tags, at('a.go')).content).toBe(
      '/*\n * @atlas\n * @kind service\n * @partOf feature:billing\n */\n\npackage main\n',
    );
  });

  test('PHP: a file that starts as HTML gets no block (it would print to the page)', () => {
    const result = applyStamp('<html><?php echo 1; ?></html>\n', tags, at('t.php'));
    expect(result).toEqual({
      content: '<html><?php echo 1; ?></html>\n',
      changed: false,
      skipped: 'no-place',
    });
  });

  test('an unreadable @atlas comment is never hidden behind a second block', () => {
    const collapsed = '/** * @atlas * @kind route * @partOf feature:x */\nx;\n';
    expect(applyStamp(collapsed, tags, at('a.ts'))).toEqual({
      content: collapsed,
      changed: false,
      skipped: 'unreadable',
    });
  });

  test('an Emacs first line that opens a longer comment is not skipped (the block would split it)', () => {
    const c = '/* -*- mode: c -*-\n * Copyright\n */\nint x;\n';
    expect(applyStamp(c, tags, at('a.c')).content).toBe(
      `/*\n * @atlas\n * @kind service\n * @partOf feature:billing\n */\n${c}`,
    );
    const whole = '/* -*- mode: c -*- */\nint x;\n';
    expect(
      applyStamp(whole, tags, at('a.c')).content.startsWith('/* -*- mode: c -*- */\n/*\n'),
    ).toBe(true);
  });

  test("only the file's own comment style can block a stamp", () => {
    const md = '# @atlas guide\n\nUse `# @atlas` lines in Python.\n';
    expect(applyStamp(md, tags, at('a.md')).changed).toBe(true);
    expect(applyStamp('<!-- see @atlas below -->\n', tags, at('a.md')).skipped).toBe('unreadable');
  });

  test('Go build constraints stay first (a block above `// +build` would switch it off)', () => {
    const go = '// +build linux\n\npackage x\n';
    expect(applyStamp(go, tags, at('a.go')).content).toBe(
      '// +build linux\n\n/*\n * @atlas\n * @kind service\n * @partOf feature:billing\n */\n\npackage x\n',
    );
  });

  test('Go constraints below a copyright header, in several groups, all stay above the block', () => {
    const go =
      '// Copyright 2015 X.\n// Licensed under MIT.\n\n// +build linux\n\n// +build amd64\n\npackage x\n';
    const { content } = applyStamp(go, tags, at('a.go'));
    expect(content.startsWith(go.slice(0, go.indexOf('package')))).toBe(true);
    expect(content.endsWith(' */\n\npackage x\n')).toBe(true);
    // no constraint: the header is not a preamble, the block goes on top
    expect(
      applyStamp('// Copyright X.\n\npackage x\n', tags, at('b.go')).content.startsWith('/*\n'),
    ).toBe(true);
  });

  test('a preamble that ends the file without a newline stays first', () => {
    expect(applyStamp('#!/bin/sh', tags, at('a.sh')).content).toBe(
      '#!/bin/sh\n# @atlas\n# @kind service\n# @partOf feature:billing\n',
    );
    expect(applyStamp('---\ntitle: x\n---', tags, at('a.md')).content).toBe(
      '---\ntitle: x\n---\n<!--\n@atlas\n@kind service\n@partOf feature:billing\n-->\n',
    );
  });

  test('a one-line `@atlas` opener is filled in place', () => {
    const md = '<!-- @atlas -->\n# Title\n';
    const { content } = applyStamp(md, tags, at('a.md'));
    expect(content).toBe('<!--\n@atlas\n@kind service\n@partOf feature:billing\n-->\n# Title\n');
    expect(parseAtlasBlock('/** @atlas pin */\nx;\n', styleOf('a.ts'))?.pinned).toBe(true);
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

  test('a doc tag after the block is never absorbed, so a re-stamp is a no-op', () => {
    for (const [path, source] of [
      ['account.lua', '---@class Account\n---@field balance number\nlocal A = {}\n'],
      ['foo.rb', '# @deprecated use Bar\nclass Foo; end\n'],
    ] as const) {
      const file = { path, style: styleOf(path) };
      const once = applyStamp(source, tags, file).content;
      expect(once.endsWith(source)).toBe(true);
      expect(applyStamp(once, tags, file).changed).toBe(false);
    }
  });

  test('repeated prefixes read as one: `;;`, `##`, `---`', () => {
    expect(parseAtlasBlock(';; @atlas\n;; @kind job\n', styleOf('a.clj'))?.kind).toEqual(['job']);
    expect(parseAtlasBlock('## @atlas\n## @kind job\n', hash)?.kind).toEqual(['job']);
    expect(parseAtlasBlock('--- @atlas\n--- @kind job\n', styleOf('a.lua'))?.kind).toEqual(['job']);
  });

  test('an empty comment line between axis lines is bridged; one after the block is not', () => {
    const source = '# @atlas\n#\n# @kind job\n#\n# Prose.\n';
    expect(parseAtlasBlock(source, hash)?.kind).toEqual(['job']);
    const { content } = applyStamp(
      source,
      { partOf: ['feature:billing'] },
      { path: 'a.py', style: hash },
    );
    expect(content).toBe('# @atlas\n# @kind job\n# @partOf feature:billing\n#\n# Prose.\n');
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
    expect(styleNameFor('n.md')).toBe('html');
    expect(styleNameFor('data.json')).toBeNull();
    expect(styleNameFor('notes.txt')).toBeNull();
    expect(styleNameFor('src/main.zig')).toBe('slash');
    expect(styleNameFor('docs/a.mdx')).toBe('mdx');
    expect(styleNameFor('makefile')).toBe('hash'); // case-insensitive
    expect(styleNameFor('stats.R')).toBe('hash');
    expect(styleNameFor('api.Dockerfile')).toBe('hash');
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

  test('a nested `.atlas/` (a package with its own config) is never walked as source', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { include: ['**/*.ts'] };\n`,
        'packages/x/.atlas/config.ts': 'export default {};\n',
        'packages/x/a.ts': '/**\n * @atlas\n */\n',
      },
      async (root) => {
        expect((await analyze(root)).files.map((f) => f.path)).toEqual(['packages/x/a.ts']);
      },
    );
  });

  test('a root the enclosing repo ignores lists its own files (not zero)', async () => {
    await withRepo(
      {
        '.gitignore': 'scratch/\n',
        'scratch/.atlas/config.ts': `export default { include: ['**/*.py'] };\n`,
        'scratch/a.py': '# @atlas\n',
      },
      async (root) => {
        const paths = (await analyze(join(root, 'scratch'))).files.map((f) => f.path);
        expect(paths).toEqual(['a.py']);
      },
      { git: true },
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

  test('`.atlas/` helpers at any depth bind to this atlas; plain strings are left alone', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `import { kinds } from './lib/kinds.ts';\nexport default { include: ['a.py'], stamp: [{ include: 'a.py', kind: kinds }] };\n`,
        '.atlas/lib/kinds.ts': `import { DEFAULT_KINDS } from '@inixiative/atlas';\nexport const kinds = DEFAULT_KINDS.includes('service') ? 'service' : 'none';\n// a string holding an import keeps its own quotes\nexport const NOTE = "import '@inixiative/atlas'";\n`,
        '.atlas/thesaurus.ts': `export const THESAURUS = {};\nexport const NAME = '@inixiative/atlas';\n`,
        'a.py': 'x = 1\n',
      },
      async (root) => {
        const [file] = (await analyze(root)).files;
        expect(file?.tagging).toBe('inline');
        const thesaurus = (await import(join(root, '.atlas/thesaurus.ts'))) as { NAME: string };
        expect(thesaurus.NAME).toBe('@inixiative/atlas');
        const stamp = await runCli(['stamp', '--json', '--root', root], { cwd: root });
        expect(stamp.out).toContain('"a.py"');
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

describe('a byte-order mark', () => {
  test('survives a stamp', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { include: ['*.ps1'], stamp: [{ include: '*.ps1', kind: 'service' }] };\n`,
        'run.ps1': new Uint8Array([
          0xef,
          0xbb,
          0xbf,
          ...new TextEncoder().encode('Write-Host "é"\n'),
        ]),
      },
      async (root) => {
        await runCli(['stamp', '--write', '--root', root], { cwd: root });
        const bytes = await Bun.file(join(root, 'run.ps1')).bytes();
        expect([...bytes.slice(0, 5)]).toEqual([0xef, 0xbb, 0xbf, 0x23, 0x20]); // BOM, then `# `
      },
    );
  });
});

describe('atlas init', () => {
  test('include globs are spelled as the files are (globs are case-sensitive)', async () => {
    await withRepo({ 'R/analysis.R': 'x <- 1\n', makefile: 'all:\n' }, async (root) => {
      expect((await detectLanguages(root)).map((l) => l.entry)).toEqual(['.R', 'makefile']);
      await runCli(['init', '--root', root], { cwd: root });
      const coverage = await runCli(['coverage', '--json', '--root', root], { cwd: root });
      expect((JSON.parse(coverage.out) as { total: number }).total).toBe(2);
    });
  });

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

describe('round-4 review', () => {
  test('symlinks are never walked, so stamp never writes outside the repo or twice', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { stamp: [{ include: 'src/**', kind: 'service' }] };\n`,
        'outside.py': 'x = 1\n',
        'repo/src/a.py': 'y = 1\n',
      },
      async (base) => {
        const root = join(base, 'repo');
        mkdirSync(join(root, '.atlas'), { recursive: true });
        writeFileSync(
          join(root, '.atlas/config.ts'),
          `export default { stamp: [{ include: 'src/**', kind: 'service' }] };\n`,
        );
        symlinkSync('../../outside.py', join(root, 'src/link.py'));
        symlinkSync('a.py', join(root, 'src/twin.py'));
        await runCli(['stamp', '--write', '--root', root], { cwd: root });
        expect(await Bun.file(join(base, 'outside.py')).text()).toBe('x = 1\n');
        expect((await analyze(root)).files.map((f) => f.path)).toEqual(['src/a.py']);
      },
    );
  });

  test("atlas's own outputs are never considered, so generate then check stays clean", async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { stamp: [{ include: '**', kind: 'service' }] };\n`,
        'a.py': '# @atlas\n# @kind service\n',
      },
      async (root) => {
        await runCli(['generate', '--root', root], { cwd: root });
        await runCli(['report', '--root', root], { cwd: root });
        writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
        expect((await analyze(root)).files.map((f) => f.path)).toEqual(['a.py']);
        expect((await runCli(['check', '--root', root], { cwd: root })).code).toBe(0);
      },
    );
  });

  test('report keeps path-tagged files out of the @uses counts, like coverage', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `export default { stamp: [{ include: '*.json', kind: 'config' }] };\n`,
        'a.py': '# @atlas\n# @kind service\n',
        'b.json': '{}\n',
      },
      async (root) => {
        const report = buildCoverageReport(await analyze(root));
        expect(report.total.files).toBe(2);
        expect(report.total.usesUncurated).toBe(1);
      },
    );
  });

  test("imports bind with forward slashes and an escaped quote (Windows, O'Brien)", () => {
    const paths = { '@inixiative/atlas': "C:\\Users\\O'Brien\\atlas\\src\\index.ts" };
    const out = bindAtlasImports(
      `import { a } from '@inixiative/atlas';\nconst b = import("@inixiative/atlas");\n`,
      paths,
    );
    // what the module loader will actually see for both forms
    const js = new Bun.Transpiler({ loader: 'ts' }).transformSync(out);
    expect(js).toContain(`from "C:/Users/O'Brien/atlas/src/index.ts"`);
    expect(js).toContain(`import("C:/Users/O'Brien/atlas/src/index.ts")`);
    expect(bindAtlasImports(`const s = '@inixiative/atlas';\n`, paths)).toBe(
      `const s = '@inixiative/atlas';\n`,
    );
  });

  test('git output is read in the C locale (a translated "not a git repository" still lists files)', async () => {
    await withRepo(
      { '.atlas/config.ts': `export default { include: ['*.py'] };\n`, 'a.py': '# @atlas\n' },
      async (root) => {
        const bin = join(root, '.fakebin');
        mkdirSync(bin);
        writeFileSync(
          join(bin, 'git'),
          '#!/bin/sh\nif [ "$LC_ALL" = C ]; then echo "fatal: not a git repository" >&2; else echo "fatal: kein Git-Repository" >&2; fi\nexit 128\n',
        );
        chmodSync(join(bin, 'git'), 0o755);
        // a separate process, so its git sees this PATH and a German locale from the start
        const run = Bun.spawnSync(
          [
            'bun',
            resolve(import.meta.dir, '../bin/atlas.ts'),
            'coverage',
            '--json',
            '--root',
            root,
          ],
          { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LC_ALL: 'de_DE.UTF-8' } },
        );
        expect(run.exitCode).toBe(0);
        expect((JSON.parse(run.stdout.toString()) as { total: number }).total).toBe(1);
      },
    );
  });

  test('a comments override moves a table entry in any case', () => {
    expect(styleNameFor('a.md', mergeCommentTable({ hash: ['.MD'] }))).toBe('hash');
  });

  test('a missing --root says so', async () => {
    const result = await runCli(['check', '--root', '/no/such/dir/atlas'], { cwd: '/' });
    expect(result.code).toBe(1);
    expect(result.out).toContain('no such directory: /no/such/dir/atlas');
  });

  test('the hook graph cache notices an edit to a nested .atlas helper', async () => {
    await withRepo(
      {
        '.atlas/config.ts': `import { kind } from './lib/kind.ts';\nexport default { include: ['a.py'], stamp: [] , kindUsed: kind };\n`,
        '.atlas/lib/kind.ts': `export const kind = 'a';\n`,
        'a.py': '# @atlas\n',
      },
      async (root) => {
        const cacheDir = join(root, '.cache-test');
        await cachedGraph(root, { cacheDir });
        const later = new Date(Date.now() + 5_000);
        writeFileSync(join(root, '.atlas/lib/kind.ts'), `export const kind = 'b';\n`);
        const { utimesSync, readdirSync, statSync } = await import('node:fs');
        utimesSync(join(root, '.atlas/lib/kind.ts'), later, later);
        const [cache] = readdirSync(cacheDir);
        const before = statSync(join(cacheDir, cache ?? '')).mtimeMs;
        await cachedGraph(root, { cacheDir });
        expect(statSync(join(cacheDir, cache ?? '')).mtimeMs).toBeGreaterThan(before);
      },
    );
  });

  test('a UTF-16 file is read, stamped, and written back as UTF-16', async () => {
    const utf16 = (text: string) => {
      const out = new Uint8Array(2 + text.length * 2);
      out.set([0xff, 0xfe]);
      for (let i = 0; i < text.length; i++) out[2 + i * 2] = text.charCodeAt(i);
      return out;
    };
    await withRepo(
      {
        '.atlas/config.ts': `export default { include: ['*.ps1'], stamp: [{ include: '*.ps1', kind: 'service' }] };\n`,
        'run.ps1': utf16('Write-Host 1\r\n'),
      },
      async (root) => {
        expect((await runCheck(await analyze(root))).problems.map((p) => p.file)).toEqual([
          'run.ps1',
        ]);
        await runCli(['stamp', '--write', '--root', root], { cwd: root });
        const bytes = await Bun.file(join(root, 'run.ps1')).bytes();
        expect([...bytes.slice(0, 4)]).toEqual([0xff, 0xfe, 0x23, 0x00]); // BOM, then `#` in UTF-16LE
        expect(new TextDecoder('utf-16le').decode(bytes)).toBe(
          '# @atlas\r\n# @kind service\r\nWrite-Host 1\r\n',
        );
        expect((await runCheck(await analyze(root))).ok).toBe(true);
      },
    );
  });
});
