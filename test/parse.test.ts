import { describe, expect, test } from 'bun:test';
import { parseAtlasBlock } from '../src/parse/parseAtlasBlock.ts';

const block = (body: string) => `/**\n${body}\n */\nimport { x } from 'y';\n`;

describe('parseAtlasBlock', () => {
  test('returns null when there is no @atlas block', () => {
    expect(parseAtlasBlock("import { x } from 'y';\n// just a comment\n")).toBeNull();
  });

  test('parses a full block with all axes, comma-splitting multi-valued lines', () => {
    const ann = parseAtlasBlock(
      block(
        ' * @atlas\n * @kind controller, entrypoint\n * @partOf feature:tenancy\n * @uses primitive:authz, infrastructure:redis\n * @concern tenantIsolation',
      ),
    );
    expect(ann).not.toBeNull();
    expect(ann?.kind).toEqual(['controller', 'entrypoint']);
    expect(ann?.partOf).toEqual(['feature:tenancy']);
    expect(ann?.uses).toEqual(['primitive:authz', 'infrastructure:redis']);
    expect(ann?.usesState).toBe('values');
    expect(ann?.concern).toEqual(['tenantIsolation']);
  });

  test('distinguishes the three @uses curation states', () => {
    const absent = parseAtlasBlock(block(' * @atlas\n * @kind helper'));
    expect(absent?.usesState).toBe('absent');
    expect(absent?.uses).toEqual([]);

    const none = parseAtlasBlock(block(' * @atlas\n * @kind helper\n * @uses none'));
    expect(none?.usesState).toBe('none');
    expect(none?.uses).toEqual([]);

    const values = parseAtlasBlock(block(' * @atlas\n * @kind helper\n * @uses primitive:caching'));
    expect(values?.usesState).toBe('values');
  });

  test('recognizes the tentative @uses? proposal marker', () => {
    const ann = parseAtlasBlock(block(' * @atlas\n * @kind job\n * @uses? infrastructure:redis'));
    expect(ann?.usesState).toBe('proposed');
    expect(ann?.uses).toEqual(['infrastructure:redis']);
  });

  test('ignores a stray @uses in prose outside the atlas block', () => {
    const src = `// this file @uses redis a lot, prose\n${block(' * @atlas\n * @kind helper')}`;
    expect(parseAtlasBlock(src)?.usesState).toBe('absent');
  });

  test('captures @constructs for factories', () => {
    const ann = parseAtlasBlock(block(' * @atlas\n * @kind constructor\n * @constructs controller'));
    expect(ann?.constructs).toEqual(['controller']);
  });

  test('exposes every parsed axis under .axes (excluding the @atlas opener)', () => {
    const ann = parseAtlasBlock(block(' * @atlas\n * @kind helper\n * @partOf feature:x'));
    expect(ann?.axes).toEqual({ kind: ['helper'], partOf: ['feature:x'] });
  });

  test('merges repeated axis lines rather than dropping one', () => {
    const ann = parseAtlasBlock(block(' * @atlas\n * @partOf feature:a\n * @partOf primitive:b'));
    expect(ann?.partOf).toEqual(['feature:a', 'primitive:b']);
  });
});
