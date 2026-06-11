import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { runCli } from '../src/cli.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

describe('runCli', () => {
  test('check exits non-zero and reports the problems', async () => {
    const { code, out } = await runCli(['check'], { cwd: MINI });
    expect(code).toBe(1);
    expect(out).toContain('missing @atlas block');
    expect(out).toContain('EMAIL.md');
  });

  test('generate --stdout prints MAP.md and exits 0', async () => {
    const { code, out } = await runCli(['generate', '--stdout'], { cwd: MINI });
    expect(code).toBe(0);
    expect(out.startsWith('# MAP')).toBe(true);
  });

  test('coverage --json is machine-readable', async () => {
    const { code, out } = await runCli(['coverage', '--json'], { cwd: MINI });
    expect(code).toBe(0);
    expect(JSON.parse(out).unannotated).toEqual(['src/lib/legacy.ts']);
  });

  test('graph --json exposes the seam indexes', async () => {
    const { out } = await runCli(['graph', '--json'], { cwd: MINI });
    expect(JSON.parse(out).seamToFiles['feature:billing']).toBeDefined();
  });

  test('--version prints a semver', async () => {
    const { code, out } = await runCli(['--version'], { cwd: MINI });
    expect(code).toBe(0);
    expect(out).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('no command prints help; unknown command exits non-zero', async () => {
    expect((await runCli([], { cwd: MINI })).out).toContain('Usage:');
    expect((await runCli(['bogus'], { cwd: MINI })).code).toBe(1);
  });
});
