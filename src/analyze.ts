import { resolve } from 'node:path';
import type { LoadedConfig } from './config/defineConfig.ts';
import { loadConfig } from './config/load.ts';
import { walkFiles } from './fs/walk.ts';
import { type AtlasAnnotation, parseAtlasBlock } from './parse/parseAtlasBlock.ts';

export type FileRecord = { path: string; annotation: AtlasAnnotation | null };
export type Analysis = { root: string; config: LoadedConfig; files: FileRecord[] };

// One pass: load the consumer's .atlas/ config, walk the considered files, and
// parse each into its @atlas annotation (or null). Every command consumes this.
export const analyze = async (root: string): Promise<Analysis> => {
  const config = await loadConfig(root);
  const paths = await walkFiles(root, config.include, config.ignore);
  const files: FileRecord[] = await Promise.all(
    paths.map(async (path) => ({
      path,
      annotation: parseAtlasBlock(await Bun.file(resolve(root, path)).text()),
    })),
  );
  return { root, config, files };
};
