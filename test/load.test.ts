import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from '../src/config/load.ts';
import { walkFiles } from '../src/fs/walk.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

const withTempAtlas = async (
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), 'atlas-load-'));
  try {
    for (const [rel, content] of Object.entries(files)) await Bun.write(resolve(dir, rel), content);
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe('loadConfig — loud on misconfiguration', () => {
  test('a present concepts.ts exporting neither CONCEPTS nor default throws (not silently {})', async () => {
    await withTempAtlas({ '.atlas/concepts.ts': 'export const WRONG = {};\n' }, async (dir) => {
      expect(loadConfig(dir)).rejects.toThrow(/concepts\.ts/);
    });
  });

  test('a bare classless tag is allowed (e.g. a derived cross-cutting marker)', async () => {
    await withTempAtlas(
      { '.atlas/concepts.ts': "export const CONCEPTS = { superadmin: {}, 'feature:x': {} };\n" },
      async (dir) => {
        const cfg = await loadConfig(dir);
        expect(cfg.concepts.superadmin).toBeDefined();
      },
    );
  });

  test('a key with an empty class or name side throws', async () => {
    await withTempAtlas(
      { '.atlas/concepts.ts': "export const CONCEPTS = { 'feature:': {} };\n" },
      async (dir) => {
        expect(loadConfig(dir)).rejects.toThrow(/feature:/);
      },
    );
  });

  test('no .atlas/ at all falls back to defaults without throwing', async () => {
    await withTempAtlas({ 'src/x.ts': 'export const x = 1;\n' }, async (dir) => {
      const cfg = await loadConfig(dir);
      expect(cfg.kinds).toContain('controller');
      expect(cfg.concepts).toEqual({});
    });
  });
});

describe('loadConfig', () => {
  test('loads vocab, registry, and config from .atlas/, merging consumer extensions', async () => {
    const cfg = await loadConfig(MINI);
    expect(cfg.kinds).toContain('controller'); // atlas default
    expect(cfg.kinds).toContain('job'); // consumer extension
    expect(cfg.concepts['feature:billing']).toBeDefined();
    expect(cfg.stamp.length).toBeGreaterThan(0);
    expect(cfg.ignore).toContain('**/index.ts');
    expect(cfg.references.docs?.('BILLING.md')).toBe('docs/BILLING.md');
  });
});

describe('walkFiles', () => {
  test('returns source files honoring include and ignore globs', async () => {
    const files = await walkFiles(MINI, ['src/**/*.ts'], ['**/*.test.ts', '**/index.ts']);
    expect(files).toEqual([
      'src/jobs/sendEmail.ts',
      'src/lib/legacy.ts',
      'src/lib/util.ts',
      'src/modules/billing/controllers/createInvoice.ts',
      'src/modules/billing/services/charge.ts',
    ]);
  });
});
