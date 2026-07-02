import { describe, expect, test } from 'bun:test';
import { invert } from '../src/registry/invert.ts';
import { conceptClass, conceptClasses } from '../src/registry/types.ts';

describe('conceptClass', () => {
  test('extracts the class prefix before the colon', () => {
    expect(conceptClass('feature:tenancy')).toBe('feature');
    expect(conceptClass('infrastructure:redis')).toBe('infrastructure');
  });

  test('returns null for a key with no colon or an empty prefix', () => {
    expect(conceptClass('tenancy')).toBeNull();
    expect(conceptClass(':tenancy')).toBeNull();
  });
});

describe('conceptClasses', () => {
  test('returns the sorted unique set of classes in the registry', () => {
    const registry = {
      'feature:tenancy': {},
      'feature:users': {},
      'primitive:authz': {},
      'infrastructure:redis': {},
    };
    expect(conceptClasses(registry)).toEqual(['feature', 'infrastructure', 'primitive']);
  });
});

describe('invert', () => {
  test('maps each field value to the concept keys that declare it', () => {
    const registry = {
      'feature:tenancy': { module: ['organization', 'space', 'membership'] },
      'feature:users': { module: ['user'] },
    };
    expect(invert(registry, 'module')).toEqual({
      organization: ['feature:tenancy'],
      space: ['feature:tenancy'],
      membership: ['feature:tenancy'],
      user: ['feature:users'],
    });
  });

  test('a value shared across concepts maps to all of them, sorted (N→M membership)', () => {
    const registry = {
      'primitive:appEvents': { module: ['appEvents', 'emailBridge'] },
      'feature:email': { module: ['email', 'emailBridge'] },
    };
    expect(invert(registry, 'module').emailBridge).toEqual([
      'feature:email',
      'primitive:appEvents',
    ]);
  });

  test('inverts any consumer-defined field, including references (doc → concepts)', () => {
    const registry = {
      'feature:inquiry': { docs: ['INQUIRY.md'] },
      'feature:nesting': { docs: ['INQUIRY.md', 'NESTING.md'] },
    };
    expect(invert(registry, 'docs')['INQUIRY.md']).toEqual(['feature:inquiry', 'feature:nesting']);
  });

  test('returns an empty object when no concept declares the field', () => {
    expect(invert({ 'feature:x': { module: ['a'] } }, 'docs')).toEqual({});
  });
});
