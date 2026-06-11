import { describe, expect, test } from 'bun:test';
import { matchGlob, matchesAny } from '../src/config/glob.ts';

describe('matchGlob', () => {
  test('matches a **-bounded directory pattern with no captures', () => {
    expect(matchGlob('**/controllers/**', 'apps/api/src/modules/billing/controllers/create.ts')).toEqual({});
  });

  test('returns null when the pattern does not match', () => {
    expect(matchGlob('**/controllers/**', 'apps/api/src/services/x.ts')).toBeNull();
  });

  test('captures a single segment via $1', () => {
    expect(matchGlob('apps/api/src/modules/$1/**', 'apps/api/src/modules/billing/services/x.ts')).toEqual({
      1: 'billing',
    });
  });

  test('captures multiple numbered segments in order', () => {
    expect(matchGlob('apps/api/src/$1/$2/**', 'apps/api/src/modules/billing/x.ts')).toEqual({
      1: 'modules',
      2: 'billing',
    });
  });

  test('* matches within a single segment only', () => {
    expect(matchGlob('src/*.ts', 'src/index.ts')).toEqual({});
    expect(matchGlob('src/*.ts', 'src/nested/index.ts')).toBeNull();
  });

  test('handles brace alternation in filename globs', () => {
    expect(matchGlob('**/*.test.{ts,tsx}', 'a/b/foo.test.tsx')).toEqual({});
    expect(matchGlob('**/*.test.{ts,tsx}', 'a/b/foo.test.ts')).toEqual({});
    expect(matchGlob('**/*.test.{ts,tsx}', 'a/b/foo.ts')).toBeNull();
  });

  test('**/ is optional so it matches at the root', () => {
    expect(matchGlob('**/index.ts', 'index.ts')).toEqual({});
    expect(matchGlob('**/index.ts', 'a/b/index.ts')).toEqual({});
  });
});

describe('matchGlob — edge matrix', () => {
  test('captures can be numbered out of order', () => {
    expect(matchGlob('a/$2/$1/x.ts', 'a/foo/bar/x.ts')).toEqual({ 1: 'bar', 2: 'foo' });
  });

  test('** mid-pattern spans segments and is optional', () => {
    expect(matchGlob('src/**/x.ts', 'src/a/b/x.ts')).toEqual({});
    expect(matchGlob('src/**/x.ts', 'src/x.ts')).toEqual({});
  });

  test('regex-special characters in literals are escaped, not interpreted', () => {
    expect(matchGlob('a.ts', 'axts')).toBeNull(); // '.' is literal, not "any char"
    expect(matchGlob('a+b.ts', 'a+b.ts')).toEqual({});
    expect(matchGlob('price$.ts', 'price$.ts')).toEqual({}); // lone $ (not $<digit>) is literal
  });

  test('a captured segment is greedy within the segment', () => {
    expect(matchGlob('a/$1.ts', 'a/foo.bar.ts')).toEqual({ 1: 'foo.bar' });
  });

  test('wildcards inside a brace alternation are honoured, not escaped', () => {
    expect(matchGlob('x.{j*,ts}', 'x.js')).toEqual({}); // j* matches "js"
    expect(matchGlob('x.{j*,ts}', 'x.ts')).toEqual({});
    expect(matchGlob('x.{j*,ts}', 'x.py')).toBeNull();
  });
});

describe('matchesAny', () => {
  test('is true when any pattern matches', () => {
    expect(matchesAny(['**/*.test.ts', '**/index.ts'], 'a/b/index.ts')).toBe(true);
  });

  test('is false when no pattern matches', () => {
    expect(matchesAny(['**/*.test.ts', '**/index.ts'], 'a/b/service.ts')).toBe(false);
  });
});
