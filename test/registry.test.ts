import { describe, expect, test } from 'bun:test';
import { invert } from '../src/registry/invert.ts';
import { seamClass, seamClasses } from '../src/registry/types.ts';

describe('seamClass', () => {
  test('extracts the class prefix before the colon', () => {
    expect(seamClass('feature:tenancy')).toBe('feature');
    expect(seamClass('infrastructure:redis')).toBe('infrastructure');
  });

  test('returns null for a key with no colon or an empty prefix', () => {
    expect(seamClass('tenancy')).toBeNull();
    expect(seamClass(':tenancy')).toBeNull();
  });
});

describe('seamClasses', () => {
  test('returns the sorted unique set of classes in the registry', () => {
    const registry = {
      'feature:tenancy': {},
      'feature:users': {},
      'primitive:authz': {},
      'infrastructure:redis': {},
    };
    expect(seamClasses(registry)).toEqual(['feature', 'infrastructure', 'primitive']);
  });
});

describe('invert', () => {
  test('maps each field value to the seam keys that declare it', () => {
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

  test('a value shared across seams maps to all of them, sorted (N→M membership)', () => {
    const registry = {
      'primitive:appEvents': { module: ['appEvents', 'emailBridge'] },
      'feature:email': { module: ['email', 'emailBridge'] },
    };
    expect(invert(registry, 'module').emailBridge).toEqual(['feature:email', 'primitive:appEvents']);
  });

  test('inverts any consumer-defined field, including references (ticket → seams)', () => {
    const registry = {
      'feature:inquiry': { tickets: ['FEAT-001'] },
      'feature:nesting': { tickets: ['FEAT-001', 'FEAT-016'] },
    };
    expect(invert(registry, 'tickets')['FEAT-001']).toEqual(['feature:inquiry', 'feature:nesting']);
  });

  test('returns an empty object when no seam declares the field', () => {
    expect(invert({ 'feature:x': { module: ['a'] } }, 'tickets')).toEqual({});
  });
});
