import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runCli } from '../src/cli.ts';

const MINI = resolve(import.meta.dir, 'fixtures/mini');

describe('runCli', () => {
  test('check exits non-zero and reports the problems', async () => {
    const { code, out } = await runCli(['check'], { cwd: MINI });
    expect(code).toBe(1);
    expect(out).toContain('missing @atlas block');
    expect(out).toContain('EMAIL.md');
  });

  test('check --warn-only still reports problems but exits 0', async () => {
    const { code, out } = await runCli(['check', '--warn-only'], { cwd: MINI });
    expect(code).toBe(0);
    expect(out).toContain('missing @atlas block');
    expect(out.toLowerCase()).toContain('warn');
  });

  test('check [target] scopes to a path and skips registry-wide reference checks', async () => {
    const { code, out } = await runCli(['check', 'src/lib'], { cwd: MINI });
    expect(code).toBe(1); // legacy.ts under src/lib is unannotated
    expect(out).toContain('src/lib/legacy.ts');
    expect(out).not.toContain('EMAIL.md'); // reference check skipped when scoped
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

  test('coverage --min gates on the percentage floor', async () => {
    expect((await runCli(['coverage', '--min', '100'], { cwd: MINI })).code).toBe(1); // 80% < 100%
    expect((await runCli(['coverage', '--min', '50'], { cwd: MINI })).code).toBe(0);
  });

  test('coverage --ratchet gates against a baseline file and --update-baseline writes it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-cov-'));
    try {
      const baseline = join(dir, 'baseline.json');
      await runCli(['coverage', '--update-baseline', '--baseline', baseline], { cwd: MINI });
      expect(JSON.parse(await Bun.file(baseline).text()).unannotated).toBe(1); // fixture has 1 unannotated

      // baseline equals current → passes
      expect((await runCli(['coverage', '--ratchet', '--baseline', baseline], { cwd: MINI })).code).toBe(0);

      // tighten baseline to 0 → current (1) is a backslide → fails
      await Bun.write(baseline, JSON.stringify({ unannotated: 0 }));
      expect((await runCli(['coverage', '--ratchet', '--baseline', baseline], { cwd: MINI })).code).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
