import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { checkVocab, runCheck } from '../src/commands/check.ts';
import type { AtlasAnnotation } from '../src/parse/parseAtlasBlock.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

const ann = (partial: Partial<AtlasAnnotation>): AtlasAnnotation => ({
  kind: [],
  partOf: [],
  uses: [],
  usesState: 'absent',
  constructs: [],
  pinned: false,
  axes: {},
  ...partial,
});

describe('analyze', () => {
  test('parses every considered file into an annotation or null', async () => {
    const a = await analyze(MINI);
    const byPath = Object.fromEntries(a.files.map((f) => [f.path, f]));
    expect(a.files.length).toBe(5);
    expect(byPath['src/lib/legacy.ts']?.annotation).toBeNull();
    expect(byPath['src/modules/billing/controllers/createInvoice.ts']?.annotation?.kind).toEqual([
      'controller',
    ]);
  });
});

describe('checkVocab', () => {
  test('flags @kind not in vocab and @partOf/@uses not in the registry', () => {
    const problems = checkVocab({
      root: '/x',
      config: {
        kinds: ['controller'],
        concepts: { 'feature:billing': {} },
        stamp: [],
        ignore: [],
        include: [],
        references: {},
      },
      files: [
        {
          path: 'a.ts',
          annotation: ann({
            kind: ['bogus'],
            partOf: ['feature:ghost'],
            uses: ['infrastructure:nope'],
          }),
        },
      ],
    });
    const messages = problems.map((p) => p.message).join('\n');
    expect(problems.length).toBe(3);
    expect(messages).toContain('bogus');
    expect(messages).toContain('feature:ghost');
    expect(messages).toContain('infrastructure:nope');
  });

  test('passes clean annotations', () => {
    expect(
      checkVocab({
        root: '/x',
        config: {
          kinds: ['controller'],
          concepts: { 'feature:billing': {} },
          stamp: [],
          ignore: [],
          include: [],
          references: {},
        },
        files: [
          { path: 'a.ts', annotation: ann({ kind: ['controller'], partOf: ['feature:billing'] }) },
        ],
      }),
    ).toEqual([]);
  });
});

describe('checkReferences — resolver safety', () => {
  test('a throwing reference resolver becomes a reference problem, not a crash', async () => {
    const { checkReferences } = await import('../src/commands/check.ts');
    const problems = await checkReferences({
      root: '/x',
      config: {
        kinds: [],
        concepts: { 'feature:x': { docs: ['A.md'] } },
        stamp: [],
        ignore: [],
        include: [],
        references: {
          docs: () => {
            throw new Error('boom');
          },
        },
      },
      files: [],
    });
    expect(problems.length).toBe(1);
    expect(problems[0]?.kind).toBe('reference');
    expect(problems[0]?.message).toContain('boom');
  });
});

describe('runCheck (against the fixture)', () => {
  test('reports the missing block and the dangling doc reference, but no vocab errors', async () => {
    const result = await runCheck(await analyze(MINI));
    expect(result.ok).toBe(false);
    expect(
      result.problems.some((p) => p.kind === 'presence' && p.file === 'src/lib/legacy.ts'),
    ).toBe(true);
    expect(result.problems.some((p) => p.kind === 'reference' && /EMAIL\.md/.test(p.message))).toBe(
      true,
    );
    expect(result.problems.some((p) => p.kind === 'vocab')).toBe(false);
  });
});
