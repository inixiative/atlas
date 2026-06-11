import { describe, expect, test } from 'bun:test';
import { partOfFor, type StampRule } from '../src/config/defineConfig.ts';
import { stampFor } from '../src/config/stamp.ts';
import type { SeamRegistry } from '../src/registry/types.ts';

const registry: SeamRegistry = {
  'feature:billing': { module: ['billing'] },
  'feature:email': { module: ['email', 'emailBridge'] },
  'primitive:appEvents': { module: ['appEvents', 'emailBridge'] },
};

const rules: StampRule[] = [
  { include: '**/controllers/**', kind: 'controller' },
  { include: 'apps/api/src/modules/$1/**', partOf: partOfFor('module', '$1') },
];

describe('stampFor', () => {
  test('fills @kind from a structural glob and @partOf from a membership capture', () => {
    const s = stampFor('apps/api/src/modules/billing/controllers/create.ts', rules, registry);
    expect(s.kind).toEqual(['controller']);
    expect(s.partOf).toEqual(['feature:billing']);
  });

  test('a capture resolving to several seams yields multi-@partOf, sorted', () => {
    const s = stampFor('apps/api/src/modules/emailBridge/handler.ts', rules, registry);
    expect(s.partOf).toEqual(['feature:email', 'primitive:appEvents']);
    expect(s.kind).toEqual([]);
  });

  test('a capture resolving to zero seams stamps nothing and is reported, not errored', () => {
    const s = stampFor('apps/api/src/modules/unknown/x.ts', rules, registry);
    expect(s.partOf).toEqual([]);
    expect(s.unresolved).toEqual([{ category: 'module', value: 'unknown' }]);
  });

  test('interpolates $n inside a literal string tag value', () => {
    const r: StampRule[] = [{ include: 'apps/web/$1/**', partOf: 'feature:$1' }];
    expect(stampFor('apps/web/dashboard/page.tsx', r, registry).partOf).toEqual(['feature:dashboard']);
  });

  test('composes contributions from every matching rule (not first-match-wins)', () => {
    const r: StampRule[] = [...rules, { include: '**/controllers/**', constructs: 'controller' }];
    const s = stampFor('apps/api/src/modules/billing/controllers/create.ts', r, registry);
    expect(s.kind).toEqual(['controller']);
    expect(s.partOf).toEqual(['feature:billing']);
    expect(s.constructs).toEqual(['controller']);
  });

  test('dedupes values contributed by more than one rule', () => {
    const r: StampRule[] = [
      { include: '**/controllers/**', kind: 'controller' },
      { include: 'apps/api/**', kind: 'controller' },
    ];
    expect(stampFor('apps/api/x/controllers/y.ts', r, registry).kind).toEqual(['controller']);
  });
});
