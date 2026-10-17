import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli.ts';
import { atlasHookEntry, hookCommandFor, setupClaudeHooks } from '../src/commands/setup.ts';

type Settings = {
  hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>;
  [key: string]: unknown;
};

const withRepo = async (fn: (root: string) => Promise<void> | void): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), 'atlas-setup-'));
  mkdirSync(join(root, '.atlas'));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const settingsPath = (root: string) => join(root, '.claude/settings.json');
const readSettings = (root: string): Settings =>
  JSON.parse(readFileSync(settingsPath(root), 'utf8')) as Settings;
const writeSettings = (root: string, text: string): void => {
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(settingsPath(root), text, 'utf8');
};

describe('setupClaudeHooks', () => {
  test('creates .claude/settings.json with the Read and Grep entries', async () => {
    await withRepo((root) => {
      const report = setupClaudeHooks(root, { write: true });
      expect(report).toEqual({
        settings: '.claude/settings.json',
        status: 'created',
        added: ['read', 'grep'],
        notes: [],
      });
      expect<unknown>(readSettings(root)).toEqual({
        hooks: { PostToolUse: [atlasHookEntry('read'), atlasHookEntry('grep')] },
      });
    });
  });

  test('merges into existing hooks without clobbering them', async () => {
    await withRepo((root) => {
      const existing = {
        model: 'opus',
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.ts' }] }],
          PostToolUse: [
            { matcher: 'Read', hooks: [{ type: 'command', command: 'other-read.ts' }] },
          ],
        },
      };
      writeSettings(root, JSON.stringify(existing, null, 2));
      const report = setupClaudeHooks(root, { write: true });
      expect(report.status).toBe('updated');
      const after = readSettings(root);
      expect(after.model).toBe('opus');
      expect(after.hooks.PreToolUse).toEqual(existing.hooks.PreToolUse);
      const post = after.hooks.PostToolUse ?? [];
      // The existing Read group gains the atlas command; Grep gets its own group.
      expect(post.map((g) => g.matcher)).toEqual(['Read', 'Grep']);
      expect(post[0]?.hooks.map((h) => h.command)).toEqual([
        'other-read.ts',
        hookCommandFor('read'),
      ]);
      expect(post[1]?.hooks.map((h) => h.command)).toEqual([hookCommandFor('grep')]);
    });
  });

  test('running twice adds nothing the second time', async () => {
    await withRepo((root) => {
      setupClaudeHooks(root, { write: true });
      const before = readFileSync(settingsPath(root), 'utf8');
      const report = setupClaudeHooks(root, { write: true });
      expect(report.status).toBe('unchanged');
      expect(report.added).toEqual([]);
      expect(readFileSync(settingsPath(root), 'utf8')).toBe(before);
    });
  });

  test('an atlas hook under any matcher group counts as present', async () => {
    await withRepo((root) => {
      writeSettings(
        root,
        JSON.stringify({
          hooks: {
            PostToolUse: [
              {
                matcher: 'Read|Grep',
                hooks: [{ type: 'command', command: 'bunx atlas hook read' }],
              },
            ],
          },
        }),
      );
      expect(setupClaudeHooks(root, { write: true }).added).toEqual(['grep']);
    });
  });

  test('dry-run reports what it would add and writes nothing', async () => {
    await withRepo((root) => {
      const report = setupClaudeHooks(root, { write: false });
      expect(report.status).toBe('dry-run');
      expect(report.added).toEqual(['read', 'grep']);
      expect(existsSync(settingsPath(root))).toBe(false);
    });
  });

  test('keeps the file’s tab indentation', async () => {
    await withRepo((root) => {
      writeSettings(root, '{\n\t"model": "opus"\n}\n');
      setupClaudeHooks(root, { write: true });
      expect(readFileSync(settingsPath(root), 'utf8')).toStartWith(
        '{\n\t"model": "opus",\n\t"hooks"',
      );
    });
  });

  test('invalid JSON is refused and left untouched', async () => {
    await withRepo((root) => {
      writeSettings(root, '{ "hooks": ');
      expect(() => setupClaudeHooks(root, { write: true })).toThrow('not valid JSON');
      expect(readFileSync(settingsPath(root), 'utf8')).toBe('{ "hooks": ');
    });
  });

  test('a settings shape the merge cannot walk is refused with a clear message', async () => {
    await withRepo((root) => {
      for (const bad of [
        { hooks: 'x' },
        { hooks: { PostToolUse: {} } },
        { hooks: { PostToolUse: [null] } },
        { hooks: { PostToolUse: [{ matcher: 'Read', hooks: 'x' }] } },
      ]) {
        writeSettings(root, JSON.stringify(bad));
        expect(() => setupClaudeHooks(root, { write: true })).toThrow('not touching it');
        expect(readFileSync(settingsPath(root), 'utf8')).toBe(JSON.stringify(bad));
      }
    });
  });

  test('notes a missing .atlas/ and the hand-copied gloss/atlas hooks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'atlas-setup-'));
    try {
      writeSettings(
        root,
        JSON.stringify({
          hooks: {
            PostToolUse: [
              {
                matcher: 'Read',
                hooks: [{ type: 'command', command: 'bun .claude/hooks/glossAtlasOnRead.ts' }],
              },
            ],
          },
        }),
      );
      const { notes } = setupClaudeHooks(root, { write: false });
      expect(notes.some((n) => n.startsWith('no .atlas/'))).toBe(true);
      expect(notes.some((n) => n.includes('glossAtlasOnRead.ts'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('atlas setup (CLI)', () => {
  test('non-interactive without --yes only says what it would add', async () => {
    await withRepo(async (root) => {
      const { code, out } = await runCli(['setup'], { cwd: root });
      expect(code).toBe(0);
      expect(out).toContain('re-run with --yes');
      expect(existsSync(settingsPath(root))).toBe(false);
    });
  });

  test('--yes writes without asking', async () => {
    await withRepo(async (root) => {
      let asked = false;
      const confirm = async () => {
        asked = true;
        return false;
      };
      const { code, out } = await runCli(['setup', '--yes'], { cwd: root, confirm });
      expect(code).toBe(0);
      expect(asked).toBe(false);
      expect(out).toContain('created .claude/settings.json: added atlas hook read, grep');
      expect(readSettings(root).hooks.PostToolUse).toHaveLength(2);
    });
  });

  test('the offer is asked; no keeps the file as is, yes writes it', async () => {
    await withRepo(async (root) => {
      const declined = await runCli(['setup'], { cwd: root, confirm: async () => false });
      expect(declined.out).toContain('skipped');
      expect(existsSync(settingsPath(root))).toBe(false);

      const questions: string[] = [];
      await runCli(['setup'], {
        cwd: root,
        confirm: async (q) => {
          questions.push(q);
          return true;
        },
      });
      expect(questions[0]).toContain('.claude/settings.json');
      expect(readSettings(root).hooks.PostToolUse).toHaveLength(2);

      const again = await runCli(['setup', '--json'], { cwd: root, confirm: async () => true });
      expect(JSON.parse(again.out).status).toBe('unchanged');
    });
  });

  test('invalid settings JSON exits 1 with a one-line message', async () => {
    await withRepo(async (root) => {
      writeSettings(root, 'nope');
      const { code, out } = await runCli(['setup', '--yes'], { cwd: root });
      expect(code).toBe(1);
      expect(out).toContain('not valid JSON');
    });
  });
});
