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
// throw becomes a message, never an unhandled crash of the whole check.
const missingReference = async (
  root: string,
  field: string,
  resolver: ReferenceResolver,
  value: string,
): Promise<string | undefined> => {
  let rel: string;
  try {
    rel = resolver(value);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `${field} resolver threw on '${value}': ${msg}`;
  }
  if (await Bun.file(resolve(root, rel)).exists()) return undefined;
  return `${field} reference '${value}' → ${rel} does not exist`;
};

// reference existence — a concept's doc paths resolve to real files.
export const checkReferences = async (a: Analysis): Promise<Problem[]> => {
  const problems: Problem[] = [];
  for (const [concept, entry] of Object.entries(a.config.concepts)) {
    for (const [field, resolver] of Object.entries(a.config.references)) {
      for (const value of entry[field] ?? []) {
        const missing = await missingReference(a.root, field, resolver, value);
        if (missing)
          problems.push({ kind: 'reference', concept, message: `${concept}: ${missing}` });
      }
    }
  }
  return problems;
};

const THESAURUS_FILE = '.atlas/thesaurus.ts';

// thesaurus existence — every entry is a registered concept with at least one non-blank
// phrase, and its own `doc` (the file part, before any `#section`) resolves to a real file
// through the same `references.docs` resolver. A defaulted doc is a `docs:` entry that
// checkReferences already covers. Whether a phrase is *apt* is the curator's call.
export const checkThesaurus = async (a: Analysis): Promise<Problem[]> => {
  const concepts = new Set(Object.keys(a.config.concepts));
  const resolver = a.config.references.docs ?? ((value: string) => value);
  const problems: Problem[] = [];
  const flag = (concept: string, message: string) =>
    problems.push({ kind: 'thesaurus', file: THESAURUS_FILE, concept, message });
  for (const [concept, { phrases, doc }] of Object.entries(a.config.thesaurus)) {
    if (!concepts.has(concept))
      flag(concept, `thesaurus names '${concept}', which is not a registered concept`);
    if (phrases.length === 0) flag(concept, `thesaurus entry '${concept}' has no phrases`);
    if (phrases.some((phrase) => phrase.trim() === ''))
      flag(concept, `thesaurus entry '${concept}' has an empty phrase`);
    if (doc !== undefined) {
      const missing = await missingReference(a.root, 'doc', resolver, splitDoc(doc).file);
      if (missing) flag(concept, `thesaurus entry '${concept}': ${missing}`);
    }
  }
  return problems;
};

// Reference existence is a registry-wide concern, so it is skipped when a run is
// scoped to a subset of files (incremental PR checks). The thesaurus check stays on:
// it reads only `.atlas/` config, which is whole in every run.
export const runCheck = async (
  a: Analysis,
  opts: { references?: boolean } = {},
): Promise<CheckResult> => {
  const problems = [...checkPresence(a), ...checkVocab(a), ...(await checkThesaurus(a))];
  if (opts.references !== false) problems.push(...(await checkReferences(a)));
  return { ok: problems.length === 0, problems };
};
