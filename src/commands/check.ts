import { resolve } from 'node:path';
import type { Analysis } from '../analyze.ts';

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

// reference existence — a concept's doc paths resolve to real files.
export const checkReferences = async (a: Analysis): Promise<Problem[]> => {
  const problems: Problem[] = [];
  for (const [concept, entry] of Object.entries(a.config.concepts)) {
    for (const [field, resolver] of Object.entries(a.config.references)) {
      for (const value of entry[field] ?? []) {
        // The resolver is consumer code — a throw becomes a structured problem,
        // never an unhandled crash of the whole check.
        let rel: string;
        try {
          rel = resolver(value);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          problems.push({
            kind: 'reference',
            concept,
            message: `${concept}: ${field} resolver threw on '${value}': ${msg}`,
          });
          continue;
        }
        if (!(await Bun.file(resolve(a.root, rel)).exists())) {
          problems.push({
            kind: 'reference',
            concept,
            message: `${concept}: ${field} reference '${value}' → ${rel} does not exist`,
          });
        }
      }
    }
  }
  return problems;
};

const THESAURUS_FILE = '.atlas/thesaurus.ts';

// thesaurus existence — every entry is a non-blank word or phrase naming at least one
// concept, and every concept it names is registered. Whether the mapping is *apt* is
// the curator's call, not atlas's.
export const checkThesaurus = (a: Analysis): Problem[] => {
  const concepts = new Set(Object.keys(a.config.concepts));
  const problems: Problem[] = [];
  for (const [word, ids] of Object.entries(a.config.thesaurus)) {
    if (word.trim() === '')
      problems.push({
        kind: 'thesaurus',
        file: THESAURUS_FILE,
        message: 'thesaurus entry with an empty word',
      });
    if (ids.length === 0)
      problems.push({
        kind: 'thesaurus',
        file: THESAURUS_FILE,
        message: `thesaurus entry '${word}' names no concept`,
      });
    for (const id of ids)
      if (!concepts.has(id))
        problems.push({
          kind: 'thesaurus',
          file: THESAURUS_FILE,
          concept: id,
          message: `thesaurus entry '${word}' names '${id}', which is not a registered concept`,
        });
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
  const problems = [...checkPresence(a), ...checkVocab(a), ...checkThesaurus(a)];
  if (opts.references !== false) problems.push(...(await checkReferences(a)));
  return { ok: problems.length === 0, problems };
};
