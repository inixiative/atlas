import { resolve } from 'node:path';
import { DEFAULT_CONCERNS } from '../vocab/concerns.ts';
import { DEFAULT_KINDS } from '../vocab/kinds.ts';
import { DEFAULT_INCLUDE } from '../fs/walk.ts';
import type { SeamRegistry } from '../registry/types.ts';
import type { AtlasConfigInput, LoadedConfig } from './defineConfig.ts';

// Import a `.atlas/` file if it exists; missing files are optional (atlas ships
// defaults for vocab), but a present file with a real error propagates.
const loadModule = async (path: string): Promise<Record<string, unknown> | null> => {
  if (!(await Bun.file(path).exists())) return null;
  return (await import(path)) as Record<string, unknown>;
};

// Pull a named export. A file that is PRESENT but exports none of `names` is a
// misconfiguration, not an "absent → use default" — throw loudly rather than
// silently degrading (e.g. an empty seam registry that passes CI against nothing).
const named = <T>(mod: Record<string, unknown> | null, file: string, ...names: string[]): T | undefined => {
  if (!mod) return undefined;
  for (const n of names) if (mod[n] !== undefined) return mod[n] as T;
  throw new Error(`.atlas/${file} exists but exports none of: ${names.join(', ')}`);
};

// Load the consumer's `.atlas/` config: kinds → concerns → seams → config (no
// evaluation-order coupling, since partOfFor is a lazy descriptor). atlas ships
// kinds/concerns defaults; the repo OWNS seams.ts.
export const loadConfig = async (root: string): Promise<LoadedConfig> => {
  const dir = resolve(root, '.atlas');
  const [kindsMod, concernsMod, seamsMod, configMod] = await Promise.all([
    loadModule(resolve(dir, 'kinds.ts')),
    loadModule(resolve(dir, 'concerns.ts')),
    loadModule(resolve(dir, 'seams.ts')),
    loadModule(resolve(dir, 'config.ts')),
  ]);

  const kinds = named<readonly string[]>(kindsMod, 'kinds.ts', 'KINDS', 'default') ?? DEFAULT_KINDS;
  const concerns = named<readonly string[]>(concernsMod, 'concerns.ts', 'CONCERNS', 'default') ?? DEFAULT_CONCERNS;
  const seams = named<SeamRegistry>(seamsMod, 'seams.ts', 'SEAMS', 'default') ?? {};
  const cfg = named<AtlasConfigInput>(configMod, 'config.ts', 'default', 'config') ?? {};

  // Seam keys are `class:name`; a malformed key would silently degrade to an
  // 'other'/'(unmapped)' bucket downstream, so reject it at load.
  for (const key of Object.keys(seams)) {
    if (key.indexOf(':') <= 0) {
      throw new Error(`.atlas/seams.ts: malformed seam key '${key}' — expected 'class:name'`);
    }
  }

  return {
    kinds,
    concerns,
    seams,
    stamp: cfg.stamp ?? [],
    ignore: cfg.ignore ?? [],
    include: cfg.include ?? DEFAULT_INCLUDE,
    references: cfg.references ?? {},
  };
};
