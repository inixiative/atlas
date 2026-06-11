import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { analyze } from '../src/analyze.ts';
import { flagsToRule, type QueryRecord, type QueryRule, queryFiles, toQueryRecords } from '../src/commands/query.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

const records: QueryRecord[] = [
  { path: 'a/createInvoice.ts', kind: ['controller'], partOf: ['feature:billing'], uses: ['infrastructure:redis'] },
  { path: 'a/charge.ts', kind: ['service'], partOf: ['feature:billing'], uses: ['primitive:caching'] },
  { path: 'b/adminCacheClear.ts', kind: ['controller'], partOf: ['primitive:caching', 'superadmin'], uses: [] },
];

describe('flagsToRule', () => {
  test('a single flag becomes one contains predicate', () => {
    expect(flagsToRule({ kind: 'controller' })).toEqual({ field: 'kind', operator: 'contains', value: 'controller' });
  });

  test('multiple flags AND together', () => {
    expect(flagsToRule({ kind: 'controller', partOf: 'feature:billing' })).toEqual({
      all: [
        { field: 'kind', operator: 'contains', value: 'controller' },
        { field: 'partOf', operator: 'contains', value: 'feature:billing' },
      ],
    });
  });

  test('no flags → null (nothing to filter)', () => {
    expect(flagsToRule({})).toBeNull();
  });
});

describe('queryFiles', () => {
  test('flag-built rule: controllers in feature:billing', () => {
    const rule = flagsToRule({ kind: 'controller', partOf: 'feature:billing' });
    expect(queryFiles(records, rule!).map((r) => r.path)).toEqual(['a/createInvoice.ts']);
  });

  test('raw json-rules predicate: anything tagged superadmin', () => {
    const rule = { field: 'partOf', operator: 'contains', value: 'superadmin' } as QueryRule;
    expect(queryFiles(records, rule).map((r) => r.path)).toEqual(['b/adminCacheClear.ts']);
  });

  test('json-rules all/any composition', () => {
    const rule = {
      all: [
        { field: 'kind', operator: 'contains', value: 'controller' },
        {
          any: [
            { field: 'partOf', operator: 'contains', value: 'superadmin' },
            { field: 'uses', operator: 'contains', value: 'infrastructure:redis' },
          ],
        },
      ],
    } as QueryRule;
    expect(queryFiles(records, rule).map((r) => r.path).sort()).toEqual(['a/createInvoice.ts', 'b/adminCacheClear.ts']);
  });
});

describe('toQueryRecords', () => {
  test('maps every considered file; unannotated files get empty axes', async () => {
    const recs = toQueryRecords(await analyze(MINI));
    expect(recs.find((r) => r.path === 'src/lib/legacy.ts')).toEqual({
      path: 'src/lib/legacy.ts',
      kind: [],
      partOf: [],
      uses: [],
    });
  });
});
