import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config/load.ts';
import { walkFiles } from '../src/fs/walk.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

describe('loadConfig', () => {
  test('loads vocab, registry, and config from .atlas/, merging consumer extensions', async () => {
    const cfg = await loadConfig(MINI);
    expect(cfg.kinds).toContain('controller'); // atlas default
    expect(cfg.kinds).toContain('job'); // consumer extension
    expect(cfg.seams['feature:billing']).toBeDefined();
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
