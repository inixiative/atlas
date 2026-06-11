import { resolve } from 'node:path';
import { analyze } from './analyze.ts';
import { runCheck } from './commands/check.ts';
import { coverage, evaluateCoverageGate, readBaseline } from './commands/coverage.ts';
import { generate } from './commands/generate.ts';
import { graph } from './commands/graph.ts';
import { inScope, runStamp } from './commands/stamp.ts';

const HELP = `atlas — the map of the codebase

Usage: atlas <command> [target] [flags]

Commands:
  graph                 reverse indexes: seam → files, file → seams, ticket/doc → seams
  check [target]        presence + vocab + reference existence (the CI command);
                        a target scopes to a path and skips registry-wide reference checks
  coverage              unannotated files; @uses curation buckets; unresolved memberships
                        gate with --min <pct> and/or --ratchet (vs a committed baseline)
  generate              write MAP.md from the annotated tree
  stamp [target]        write/refresh @atlas blocks from the config rules (the patcher)

Flags:
  --root <dir>          repo root to operate on (default: cwd)
  --json                machine-readable output (graph/check/coverage/stamp)
  --stdout              print MAP.md instead of writing the file (generate)
  --warn-only           print problems but always exit 0 (check; warn-only rollout)
  --min <pct>           fail if annotated coverage is below this percentage (coverage)
  --ratchet             fail if unannotated count exceeds the baseline (coverage)
  --update-baseline     write the current unannotated count as the baseline (coverage)
  --baseline <path>     baseline file (default: .atlas/coverage-baseline.json)
  --write               persist changes (stamp; default is a dry-run)
  --overwrite           resync derivable @kind/@partOf, preserving curated @uses/@concern (stamp)
  --version             print version
  --help                this help`;

type Flags = Record<string, string | boolean>;

// Flags that consume the next token as a value; everything else is boolean.
const VALUE_FLAGS = new Set(['root', 'min', 'baseline']);

const parseArgs = (args: string[]): { flags: Flags; positionals: string[] } => {
  const flags: Flags = {};
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (VALUE_FLAGS.has(key)) flags[key] = args[++i] ?? '';
      else flags[key] = true;
    } else positionals.push(a);
  }
  return { flags, positionals };
};

const version = async (): Promise<string> => {
  const pkg = (await import('../package.json')) as { version?: string; default?: { version?: string } };
  return pkg.version ?? pkg.default?.version ?? '0.0.0';
};

export const runCli = async (argv: string[], env: { cwd: string }): Promise<{ code: number; out: string }> => {
  const out: string[] = [];
  const log = (s = ''): void => void out.push(s);
  const done = (code: number) => ({ code, out: out.join('\n') });

  const { flags, positionals } = parseArgs(argv);
  const command = positionals[0];
  const root = (flags.root as string) || env.cwd;
  const json = flags.json === true;

  if (flags.version === true) return { code: 0, out: await version() };
  if (flags.help === true || command === undefined || command === 'help') return { code: 0, out: HELP };

  switch (command) {
    case 'check': {
      const target = positionals[1];
      const warnOnly = flags['warn-only'] === true;
      const full = await analyze(root);
      const scoped = target ? { ...full, files: full.files.filter((f) => inScope(f.path, target)) } : full;
      const result = await runCheck(scoped, { references: target === undefined });

      if (json) log(JSON.stringify({ ...result, warnOnly }, null, 2));
      else if (result.ok) log('✓ atlas check passed');
      else {
        log(`${warnOnly ? '⚠' : '✗'} atlas check: ${result.problems.length} problem(s)${warnOnly ? ' — warn-only' : ''}`);
        for (const p of result.problems) log(`  [${p.kind}] ${p.file ?? p.seam ?? ''} — ${p.message}`);
      }
      return done(result.ok || warnOnly ? 0 : 1);
    }

    case 'coverage': {
      const c = coverage(await analyze(root));
      const baselinePath = resolve(root, (flags.baseline as string) || '.atlas/coverage-baseline.json');

      if (flags['update-baseline'] === true) {
        await Bun.write(baselinePath, `${JSON.stringify({ unannotated: c.unannotated.length }, null, 2)}\n`);
        log(`✓ wrote coverage baseline: ${c.unannotated.length} unannotated`);
        return done(0);
      }

      let ratchet: number | undefined;
      if (flags.ratchet === true) {
        const baseline = await readBaseline(baselinePath);
        if (baseline === null) {
          log(`no baseline at ${baselinePath} — run: atlas coverage --update-baseline`);
          return done(1);
        }
        ratchet = baseline;
      }
      const min = flags.min !== undefined ? Number(flags.min) : undefined;
      const gate = evaluateCoverageGate(c, { min, ratchet });
      const gating = min !== undefined || ratchet !== undefined;

      if (json) {
        log(JSON.stringify({ ...c, percent: gate.percent, gate }, null, 2));
      } else {
        log(`Coverage: ${c.annotated}/${c.total} files annotated (${gate.percent.toFixed(1)}%)`);
        if (c.unannotated.length) log(`  unannotated (${c.unannotated.length}):\n${c.unannotated.map((f) => `    ${f}`).join('\n')}`);
        log(`  @uses — curated ${c.uses.curated.length}, curated-empty ${c.uses.curatedEmpty.length}, proposed ${c.uses.proposed.length}, uncurated ${c.uses.uncurated.length}`);
        if (c.unresolved.length) log(`  unresolved memberships (${c.unresolved.length}):\n${c.unresolved.map((u) => `    ${u.file}: ${u.category}:${u.value}`).join('\n')}`);
        if (!gate.ok) for (const r of gate.reasons) log(`✗ ${r}`);
        else if (gating) log('✓ coverage gate passed');
      }
      return done(gate.ok ? 0 : 1);
    }

    case 'graph': {
      const g = graph(await analyze(root));
      if (json) log(JSON.stringify(g, null, 2));
      else {
        log('seam → files (@partOf):');
        for (const seam of Object.keys(g.seamToFiles).sort()) log(`  ${seam} (${g.seamToFiles[seam]!.length})`);
        log('seam → consumers (@uses):');
        for (const seam of Object.keys(g.usesConsumers).sort()) log(`  ${seam} (${g.usesConsumers[seam]!.length})`);
      }
      return done(0);
    }

    case 'generate': {
      const map = generate(await analyze(root));
      if (flags.stdout === true) log(map);
      else {
        await Bun.write(resolve(root, 'MAP.md'), map);
        log(`✓ wrote MAP.md (${map.split('\n').length} lines)`);
      }
      return done(0);
    }

    case 'stamp': {
      const mode = flags.overwrite === true ? 'overwrite' : 'additive';
      const write = flags.write === true;
      const changes = await runStamp(root, { mode, target: positionals[1], write });
      if (json) log(JSON.stringify(changes.map((c) => ({ path: c.path })), null, 2));
      else if (!changes.length) log('✓ nothing to stamp — already up to date');
      else {
        log(`${write ? 'Wrote' : 'Would change'} ${changes.length} file(s)${write ? '' : ' (dry-run — pass --write to apply)'}:`);
        for (const c of changes) log(`  ${c.path}`);
      }
      return done(0);
    }

    default:
      log(`unknown command: ${command}\n`);
      log(HELP);
      return done(1);
  }
};
