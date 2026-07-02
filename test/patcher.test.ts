import { describe, expect, test } from 'bun:test';
import { parseAtlasBlock } from '../src/parse/parseAtlasBlock.ts';
import { applyStamp, renderBlock } from '../src/stamp/patcher.ts';

describe('renderBlock', () => {
  test('renders axes in canonical order, omitting empty ones', () => {
    expect(renderBlock({ kind: ['controller'], partOf: ['feature:billing'] })).toBe(
      ['/**', ' * @atlas', ' * @kind controller', ' * @partOf feature:billing', ' */'].join('\n'),
    );
  });

  test('joins multi-valued axes with commas and includes @constructs', () => {
    expect(renderBlock({ kind: ['constructor'], constructs: ['controller', 'job'] })).toBe(
      ['/**', ' * @atlas', ' * @kind constructor', ' * @constructs controller, job', ' */'].join(
        '\n',
      ),
    );
  });

  test('renders the three @uses states', () => {
    expect(renderBlock({ kind: ['helper'], usesState: 'none' })).toContain(' * @uses none');
    expect(
      renderBlock({ kind: ['job'], uses: ['infrastructure:redis'], usesState: 'proposed' }),
    ).toContain(' * @uses? infrastructure:redis');
    expect(renderBlock({ kind: ['c'], uses: ['primitive:authz'], usesState: 'values' })).toContain(
      ' * @uses primitive:authz',
    );
  });
});

describe('applyStamp — new block', () => {
  test('inserts a fresh block at the top of an unannotated file', () => {
    const src = "import { x } from 'y';\n";
    const { content, changed } = applyStamp(src, {
      kind: ['controller'],
      partOf: ['feature:billing'],
    });
    expect(changed).toBe(true);
    const ann = parseAtlasBlock(content);
    expect(ann?.kind).toEqual(['controller']);
    expect(ann?.partOf).toEqual(['feature:billing']);
    expect(content.endsWith(src)).toBe(true); // original code preserved below the block
  });
});

describe('applyStamp — additive (default)', () => {
  const existing = [
    '/**',
    ' * @atlas',
    ' * @kind controller',
    ' * @uses primitive:authz',
    ' */',
    'code()',
  ].join('\n');

  test('adds missing derivable values without touching curated @uses', () => {
    const { content } = applyStamp(existing, { kind: ['controller'], partOf: ['feature:billing'] });
    const ann = parseAtlasBlock(content);
    expect(ann?.partOf).toEqual(['feature:billing']); // added
    expect(ann?.uses).toEqual(['primitive:authz']); // preserved
    expect(ann?.usesState).toBe('values');
  });

  test('never removes a hand-added value that the rules did not produce', () => {
    const withOverload = [
      '/**',
      ' * @atlas',
      ' * @kind controller, entrypoint',
      ' */',
      'code()',
    ].join('\n');
    const { content } = applyStamp(withOverload, { kind: ['controller'] });
    expect(parseAtlasBlock(content)?.kind).toEqual(['controller', 'entrypoint']);
  });

  test('is idempotent — re-stamping the same values reports no change', () => {
    const { content: once } = applyStamp(existing, {
      kind: ['controller'],
      partOf: ['feature:billing'],
    });
    const { changed } = applyStamp(
      once,
      { kind: ['controller'], partOf: ['feature:billing'] },
      'additive',
    );
    expect(changed).toBe(false);
  });
});

describe('applyStamp — CRLF & placement', () => {
  test('a CRLF file already matching the rules re-stamps to no change (idempotent)', () => {
    const crlf = [
      '/**',
      ' * @atlas',
      ' * @kind controller',
      ' * @partOf feature:billing',
      ' */',
      'code()',
      '',
    ].join('\r\n');
    const { changed } = applyStamp(crlf, { kind: ['controller'], partOf: ['feature:billing'] });
    expect(changed).toBe(false);
  });

  test('a fresh block is inserted after a shebang, not above it', () => {
    const src = '#!/usr/bin/env bun\nexport const x = 1;\n';
    const { content } = applyStamp(src, { kind: ['controller'] });
    expect(content.startsWith('#!/usr/bin/env bun\n')).toBe(true);
    expect(parseAtlasBlock(content)?.kind).toEqual(['controller']);
  });

  test('additive @partOf is sorted to match a fresh stamp', () => {
    const existing = ['/**', ' * @atlas', ' * @partOf feature:z', ' */', 'code()'].join('\n');
    const { content } = applyStamp(existing, { partOf: ['feature:a'] });
    expect(parseAtlasBlock(content)?.partOf).toEqual(['feature:a', 'feature:z']);
  });
});

describe('applyStamp — overwrite', () => {
  const existing = [
    '/**',
    ' * @atlas',
    ' * @kind controller, entrypoint',
    ' * @partOf feature:old',
    ' * @uses primitive:authz',
    ' */',
    'code()',
  ].join('\n');

  test('resyncs @kind/@partOf to the rules but preserves curated @uses', () => {
    const { content } = applyStamp(
      existing,
      { kind: ['controller'], partOf: ['feature:billing'] },
      'overwrite',
    );
    const ann = parseAtlasBlock(content);
    expect(ann?.kind).toEqual(['controller']); // entrypoint overload dropped
    expect(ann?.partOf).toEqual(['feature:billing']); // feature:old replaced
    expect(ann?.uses).toEqual(['primitive:authz']); // curated, preserved
  });

  test('a pinned block is exempt from overwrite', () => {
    const pinned = existing.replace(' * @atlas', ' * @atlas pin');
    const { content, changed } = applyStamp(
      pinned,
      { kind: ['controller'], partOf: ['feature:billing'] },
      'overwrite',
    );
    expect(changed).toBe(false);
    expect(parseAtlasBlock(content)?.partOf).toEqual(['feature:old']);
  });
});
