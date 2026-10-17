import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyze } from '../analyze.ts';
import { type Graph, graph } from '../commands/graph.ts';

export const GRAPH_CACHE_TTL_MS = 10 * 60 * 1000;

export type CachedGraphOptions = { ttlMs?: number; cacheDir?: string; version?: string };

const defaultCacheDir = (): string => join(tmpdir(), 'atlas-hooks');

const cachePathFor = (root: string, cacheDir: string, version: string): string =>
  join(
    cacheDir,
    `graph-${createHash('sha1').update(`${version}\0${root}`).digest('hex').slice(0, 16)}.json`,
  );

// A `.atlas/` edit (new concept, new rule) makes the cached graph wrong before the TTL does.
const configNewerThan = (root: string, mtimeMs: number): boolean => {
  const dir = join(root, '.atlas');
  return readdirSync(dir).some((entry) => statSync(join(dir, entry)).mtimeMs > mtimeMs);
};

// The hooks fire on every Read/Grep and a full analyze walks the whole tree (seconds on a
// large repo), so the graph is cached per root for a short TTL. Keyed by atlas version so
// an upgrade never reads a graph of an older shape.
export const cachedGraph = async (
  root: string,
  options: CachedGraphOptions = {},
): Promise<Graph | undefined> => {
  if (!existsSync(join(root, '.atlas'))) return undefined;
  const ttlMs = options.ttlMs ?? GRAPH_CACHE_TTL_MS;
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const cachePath = cachePathFor(root, cacheDir, options.version ?? '');

  if (existsSync(cachePath)) {
    const { mtimeMs } = statSync(cachePath);
    // mtimes carry sub-millisecond precision that Date.now() lacks; allow that much skew,
    // but a cache dated well in the future is not trusted as fresh.
    const age = Date.now() - mtimeMs;
    if (age > -1_000 && age < ttlMs && !configNewerThan(root, mtimeMs)) {
      return (await Bun.file(cachePath).json()) as Graph;
    }
  }

  const fresh = graph(await analyze(root));
  mkdirSync(cacheDir, { recursive: true });
  // Write-then-rename: parallel hooks (a Read and a Grep in one turn) never read a torn file.
  const tmp = `${cachePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(fresh), 'utf8');
  renameSync(tmp, cachePath);
  return fresh;
};
