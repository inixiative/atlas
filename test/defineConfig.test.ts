import { describe, expect, test } from 'bun:test';
import { isPartOfFor, partOfFor } from '../src/config/defineConfig.ts';

describe('isPartOfFor', () => {
  test('accepts a real descriptor from the factory', () => {
    expect(isPartOfFor(partOfFor('module', '$1'))).toBe(true);
  });

  test('rejects a marker missing category/capture (guard must not over-claim)', () => {
    expect(isPartOfFor({ __atlasPartOfFor: true })).toBe(false);
    expect(isPartOfFor({ __atlasPartOfFor: true, category: 'm' })).toBe(false);
  });

  test('rejects non-descriptors', () => {
    expect(isPartOfFor({})).toBe(false);
    expect(isPartOfFor(null)).toBe(false);
    expect(isPartOfFor('feature:x')).toBe(false);
  });
});
