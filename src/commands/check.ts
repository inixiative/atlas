import { resolve } from 'node:path';
import type { Analysis } from '../analyze.ts';
import type { ReferenceResolver } from '../config/defineConfig.ts';
import { splitDoc } from './graph.ts';

// Enforcement is EXISTENCE, not correctness: presence of a block, validity of
// the vocabulary used, existence of referenced docs, and thesaurus entries that
// name real concepts. atlas never
// checks "is this @partOf actually true" or any derived status — fool's errands.
export type Problem = {
  kind: 'presence' | 'vocab' | 'reference' | 'thesaurus';
  file?: string;
  concept?: string;
  message: string;
};

export type CheckResult = { ok: boolean; problems: Problem[] };

// presence — every considered (non-ignored) file carries an @atlas block.
export const checkPresence = (a: Analysis): Problem[] =>
  a.files
    .filter((f) => f.annotation === null)
    .map((f) => ({ kind: 'presence' as const, file: f.path, message: 'missing @atlas block' }));

// vocab existence — @kind is in the vocab; @partOf/@uses name a concept that
// EXISTS in the registry (not: is the file really part of it).
export const checkVocab = (a: Analysis): Problem[] => {
  const kinds = new Set(a.config.kinds);
  const concepts = new Set(Object.keys(a.config.concepts));
  const problems: Problem[] = [];
  for (const { path, annotation } of a.files) {
    if (!annotation) continue;
    for (const k of annotation.kind)
      if (!kinds.has(k))
        problems.push({ kind: 'vocab', file: path, message: `unknown @kind '${k}'` });
    for (const p of annotation.partOf)
      if (!concepts.has(p))
        problems.push({
          kind: 'vocab',
          file: path,
          message: `@partOf '${p}' is not a registered concept`,
        });
    for (const u of annotation.uses)
      if (!concepts.has(u))
        problems.push({
          kind: 'vocab',
          file: path,
          message: `@uses '${u}' is not a registered concept`,
        });
  }
  return problems;
};

// Resolve one reference value and confirm the file exists. The resolver is consumer code — a
// throw is reported, never an unhandled crash of the whole check.
type MissingReference = { rel: string } | { threw: string } | undefined;

const missingReference = async (
  root: string,
  resolver: ReferenceResolver,
  value: string,
): Promise<MissingReference> => {
  let rel: string;
  try {
    rel = resolver(value);
  } catch (err) {
    return { threw: err instanceof Error ? err.message : String(err) };
  }
  return (await Bun.file(resolve(root, rel)).exists()) ? undefined : { rel };
};

// reference existence — a concept's doc paths resolve to real files.
export const checkReferences = async (a: Analysis): Promise<Problem[]> => {
  const problems: Problem[] = [];
  for (const [concept, entry] of Object.entries(a.config.concepts)) {
    for (const [field, resolver] of Object.entries(a.config.references)) {
      for (const value of entry[field] ?? []) {
        const missing = await missingReference(a.root, resolver, value);
        if (!missing) continue;
        problems.push({
          kind: 'reference',
          concept,
          message:
            'threw' in missing
              ? `${concept}: ${field} resolver threw on '${value}': ${missing.threw}`
              : `${concept}: ${field} reference '${value}' → ${missing.rel} does not exist`,
        });
      }
    }
  }
  return problems;
};

const THESAURUS_FILE = '.atlas/thesaurus.ts';

// thesaurus existence — every entry is a registered concept with at least one non-blank
// phrase, and its own `doc` (the file part, before any `#section`) resolves to a real file
// through the same `references.docs` resolver. The doc check is a reference check, so a
// scoped run skips it like the others. A defaulted doc is a `docs:` entry that
// checkReferences already covers. Whether a phrase is *apt* is the curator's call.
export const checkThesaurus = async (
  a: Analysis,
  opts: { references?: boolean } = {},
): Promise<Problem[]> => {
  const concepts = new Set(Object.keys(a.config.concepts));
  const resolver = a.config.references.docs ?? ((value: string) => value);
  const problems: Problem[] = [];
  const flag = (concept: string, message: string) =>
    problems.push({ kind: 'thesaurus', file: THESAURUS_FILE, concept, message });
  for (const [concept, { phrases, doc }] of Object.entries(a.config.thesaurus)) {
    if (!concepts.has(concept))
      flag(concept, `thesaurus names '${concept}', which is not a registered concept`);
    if (phrases.length === 0) flag(concept, `thesaurus entry '${concept}' has no phrases`);
    // A phrase with no letter or digit can never match a search.
    if (phrases.some((phrase) => !/[\p{L}\p{N}]/u.test(phrase)))
      flag(concept, `thesaurus entry '${concept}' has an empty phrase`);
    if (doc !== undefined && opts.references !== false) {
      const missing = await missingReference(a.root, resolver, splitDoc(doc).file);
      if (missing)
        flag(
          concept,
          'threw' in missing
            ? `thesaurus entry '${concept}': docs resolver threw on doc '${doc}': ${missing.threw}`
            : `thesaurus entry '${concept}': doc '${doc}' → ${missing.rel} does not exist`,
        );
    }
  }
  return problems;
};

// Reference existence is a registry-wide concern, so it is skipped when a run is
// scoped to a subset of files (incremental PR checks). The thesaurus shape checks stay on:
// they read only `.atlas/` config, which is whole in every run.
export const runCheck = async (
  a: Analysis,
  opts: { references?: boolean } = {},
): Promise<CheckResult> => {
  const problems = [...checkPresence(a), ...checkVocab(a), ...(await checkThesaurus(a, opts))];
  if (opts.references !== false) problems.push(...(await checkReferences(a)));
  return { ok: problems.length === 0, problems };
};
