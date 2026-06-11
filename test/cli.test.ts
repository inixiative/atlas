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

  test('graph --json exposes the concept indexes', async () => {
    const { out } = await runCli(['graph', '--json'], { cwd: MINI });
    expect(JSON.parse(out).conceptToFiles['feature:billing']).toBeDefined();
  });

  test('query with flags filters by axis', async () => {
    const { code, out } = await runCli(['query', '--kind', 'controller', '--partOf', 'feature:billing'], { cwd: MINI });
    expect(code).toBe(0);
    expect(out).toContain('src/modules/billing/controllers/createInvoice.ts');
    expect(out).not.toContain('charge.ts'); // a service, filtered out
  });

  test('query accepts a raw json-rules predicate', async () => {
    const pred = JSON.stringify({ field: 'uses', operator: 'contains', value: 'infrastructure:redis' });
    const { code, out } = await runCli(['query', pred], { cwd: MINI });
    expect(code).toBe(0);
    expect(out).toContain('src/modules/billing/services/charge.ts'); // the redis user
  });

  test('query with no predicate or flags errors', async () => {
    expect((await runCli(['query'], { cwd: MINI })).code).toBe(1);
  });

  test('coverage --min with a non-numeric value errors instead of silently disabling the gate', async () => {
    const { code, out } = await runCli(['coverage', '--min', 'abc'], { cwd: MINI });
    expect(code).toBe(1);
    expect(out.toLowerCase()).toContain('--min');
  });

  test('an active gate over zero matched files fails (misconfig guard)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-empty-'));
    try {
      await Bun.write(join(dir, 'readme.txt'), 'no source here\n'); // no .ts files
      const { code, out } = await runCli(['coverage', '--min', '50'], { cwd: dir });
      expect(code).toBe(1);
      expect(out.toLowerCase()).toContain('0');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a misconfigured .atlas surfaces as a clean error + exit 1, not a stack trace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-bad-'));
    try {
      await Bun.write(join(dir, '.atlas/concepts.ts'), 'export const WRONG = {};\n');
      const { code, out } = await runCli(['check'], { cwd: dir });
      expect(code).toBe(1);
      expect(out).toContain('concepts.ts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('report --stdout prints the coverage markdown', async () => {
    const { code, out } = await runCli(['report', '--stdout'], { cwd: MINI });
    expect(code).toBe(0);
    expect(out.startsWith('# Coverage')).toBe(true);
  });

  test('report --json includes report + graph data', async () => {
    const { out } = await runCli(['report', '--json'], { cwd: MINI });
    const d = JSON.parse(out);
    expect(d.report.total.files).toBe(5);
    expect(d.graph.nodes.length).toBe(4);
  });

  test('report writes COVERAGE.md and atlas.html to --out', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'atlas-report-'));
    try {
      const { code } = await runCli(['report', '--out', dir], { cwd: MINI });
      expect(code).toBe(0);
      expect(await Bun.file(join(dir, 'COVERAGE.md')).exists()).toBe(true);
      expect(await Bun.file(join(dir, 'atlas.html')).exists()).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
