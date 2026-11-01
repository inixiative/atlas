import { resolve } from 'node:path';
import type { ConceptRegistry, Thesaurus } from '../registry/types.ts';
import { COMMENT_STYLES, type CommentTable, mergeCommentTable } from '../syntax/comments.ts';
import { DEFAULT_KINDS } from '../vocab/kinds.ts';
import type { AtlasConfigInput, LoadedConfig } from './defineConfig.ts';

// `.atlas/**/*.ts` imports `@inixiative/atlas` (defineConfig, partOfFor, DEFAULT_KINDS). Bind those
// imports to the atlas that is running, so the config loads in a repo with no package.json or
// node_modules (`bunx @inixiative/atlas check` in a Python repo) and never against another
// installed version. Bun's runtime plugins ignore onResolve for bare imports, so the specifier
// is rewritten on load.
// Forward slashes: the path is spliced into a string literal, where a Windows `\` would be read
// as an escape (`C:\Users\node_modules` → `C:Users<newline>ode_modules`). Bun accepts `C:/…`.
const SELF: Record<string, string> = {
  '@inixiative/atlas': resolve(import.meta.dir, '../index.ts').replaceAll('\\', '/'),
  '@inixiative/atlas/config': resolve(import.meta.dir, './defineConfig.ts').replaceAll('\\', '/'),
};
// only a module specifier: `from '…'`, `import '…'`, `import('…')`, never another string literal
const ATLAS_IMPORT = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(@inixiative\/atlas(?:\/config)?)\2/g;
let bound = false;
const bindSelfImports = (): void => {
  if (bound) return;
  bound = true;
  Bun.plugin({
    name: 'atlas-config-self',
    target: 'bun',
    setup(build) {
      build.onLoad({ filter: /[\\/]\.atlas[\\/].+\.[cm]?ts$/ }, async ({ path }) => ({
        loader: 'ts',
        contents: (await Bun.file(path).text()).replace(
          ATLAS_IMPORT,
          (_, keyword: string, quote: string, specifier: string) =>
            `${keyword}${quote}${SELF[specifier]?.replaceAll(quote, `\\${quote}`)}${quote}`,
        ),
      }));
    },
  });
};

// Import a `.atlas/` file if it exists; missing files are optional (atlas ships
// defaults for vocab), but a present file with a real error propagates.
const loadModule = async (path: string): Promise<Record<string, unknown> | null> => {
  if (!(await Bun.file(path).exists())) return null;
  return (await import(path)) as Record<string, unknown>;
};

// Pull a named export. A file that is PRESENT but exports none of `names` is a
// misconfiguration, not an "absent → use default" — throw loudly rather than
// silently degrading (e.g. an empty concept registry that passes CI against nothing).
const named = <T>(
  mod: Record<string, unknown> | null,
  file: string,
  ...names: string[]
): T | undefined => {
  if (!mod) return undefined;
  for (const n of names) if (mod[n] !== undefined) return mod[n] as T;
  throw new Error(`.atlas/${file} exists but exports none of: ${names.join(', ')}`);
};

// `comments` names styles atlas has; a typo would silently tag nothing, so refuse it.
const validComments = (comments: CommentTable | undefined): CommentTable | undefined => {
  for (const [style, entries] of Object.entries(comments ?? {})) {
    if (!(style in COMMENT_STYLES))
      throw new Error(
        `.atlas/config.ts: comments.${style} is not a comment style (${Object.keys(COMMENT_STYLES).join(', ')})`,
      );
    if (!Array.isArray(entries) || entries.some((e) => typeof e !== 'string' || e === ''))
      throw new Error(
        `.atlas/config.ts: comments.${style} must list '.ext' extensions or file names`,
      );
  }
  return comments;
};

// Load the consumer's `.atlas/` config: kinds → concepts → thesaurus → config (no
// evaluation-order coupling, since partOfFor is a lazy descriptor). atlas ships
// the kinds defaults; the repo OWNS concepts.ts and the optional thesaurus.ts.
export const loadConfig = async (root: string): Promise<LoadedConfig> => {
  bindSelfImports();
  const dir = resolve(root, '.atlas');
  const [kindsMod, conceptsMod, thesaurusMod, configMod] = await Promise.all([
    loadModule(resolve(dir, 'kinds.ts')),
    loadModule(resolve(dir, 'concepts.ts')),
    loadModule(resolve(dir, 'thesaurus.ts')),
    loadModule(resolve(dir, 'config.ts')),
  ]);

  const kinds = named<readonly string[]>(kindsMod, 'kinds.ts', 'KINDS', 'default') ?? DEFAULT_KINDS;
  const concepts = named<ConceptRegistry>(conceptsMod, 'concepts.ts', 'CONCEPTS', 'default') ?? {};
  const thesaurus = named<Thesaurus>(thesaurusMod, 'thesaurus.ts', 'THESAURUS', 'default') ?? {};
  const cfg = named<AtlasConfigInput>(configMod, 'config.ts', 'default', 'config') ?? {};

  // Concept keys are either `class:name` (a layer member) or a bare classless
  // tag (a derived cross-cutting marker like `superadmin`). Reject only a key
  // with an empty class or name side — that's a typo, not a deliberate shape.
  for (const key of Object.keys(concepts)) {
    const colon = key.indexOf(':');
    if (key.length === 0 || colon === 0 || colon === key.length - 1) {
      throw new Error(
        `.atlas/concepts.ts: malformed concept key '${key}' — use 'class:name' or a bare tag`,
      );
    }
  }

  // A malformed entry would be read character by character downstream; refuse it here.
  for (const [concept, entry] of Object.entries(thesaurus)) {
    const { phrases, doc, ...rest } = (entry ?? {}) as Partial<Record<string, unknown>>;
    if (
      typeof entry !== 'object' ||
      entry === null ||
      Object.keys(rest).length > 0 || // a `docs:` typo would silently fall back to the default doc
      !Array.isArray(phrases) ||
      phrases.some((phrase) => typeof phrase !== 'string') ||
      (doc !== undefined && typeof doc !== 'string')
    ) {
      throw new Error(
        `.atlas/thesaurus.ts: '${concept}' must be { phrases: string[]; doc?: string }`,
      );
    }
  }

  return {
    include: cfg.include ?? null,
    comments: mergeCommentTable(validComments(cfg.comments)),
    kinds,
    concepts,
    thesaurus,
    stamp: cfg.stamp ?? [],
    ignore: cfg.ignore ?? [],
    references: cfg.references ?? {},
  };
};
