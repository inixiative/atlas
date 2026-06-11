import { resolve } from 'node:path';
import type { Analysis } from '../analyze.ts';

// Enforcement is EXISTENCE, not correctness: presence of a block, validity of
// the vocabulary used, and existence of referenced docs/tickets. atlas never
// checks "is this @partOf actually true" or any derived status — fool's errands.
export type Problem = {
  kind: 'presence' | 'vocab' | 'reference';
  file?: string;
  seam?: string;
  message: string;
};

export type CheckResult = { ok: boolean; problems: Problem[] };

// presence — every considered (non-ignored) file carries an @atlas block.
export const checkPresence = (a: Analysis): Problem[] =>
  a.files
    .filter((f) => f.annotation === null)
    .map((f) => ({ kind: 'presence' as const, file: f.path, message: 'missing @atlas block' }));

// vocab existence — @kind/@concern are in the vocab; @partOf/@uses name a seam
// that EXISTS in the registry (not: is the file really part of it).
export const checkVocab = (a: Analysis): Problem[] => {
  const kinds = new Set(a.config.kinds);
  const concerns = new Set(a.config.concerns);
  const seams = new Set(Object.keys(a.config.seams));
  const problems: Problem[] = [];
  for (const { path, annotation } of a.files) {
    if (!annotation) continue;
    for (const k of annotation.kind) if (!kinds.has(k)) problems.push({ kind: 'vocab', file: path, message: `unknown @kind '${k}'` });
    for (const c of annotation.concern)
      if (!concerns.has(c)) problems.push({ kind: 'vocab', file: path, message: `unknown @concern '${c}'` });
    for (const p of annotation.partOf)
      if (!seams.has(p)) problems.push({ kind: 'vocab', file: path, message: `@partOf '${p}' is not a registered seam` });
    for (const u of annotation.uses)
      if (!seams.has(u)) problems.push({ kind: 'vocab', file: path, message: `@uses '${u}' is not a registered seam` });
  }
  return problems;
};

// reference existence — a seam's doc/ticket paths resolve to real files.
export const checkReferences = async (a: Analysis): Promise<Problem[]> => {
  const problems: Problem[] = [];
  for (const [seam, entry] of Object.entries(a.config.seams)) {
    for (const [field, resolver] of Object.entries(a.config.references)) {
      for (const value of entry[field] ?? []) {
        const rel = resolver(value);
        if (!(await Bun.file(resolve(a.root, rel)).exists())) {
          problems.push({ kind: 'reference', seam, message: `${seam}: ${field} reference '${value}' → ${rel} does not exist` });
        }
      }
    }
  }
  return problems;
};

export const runCheck = async (a: Analysis): Promise<CheckResult> => {
  const problems = [...checkPresence(a), ...checkVocab(a), ...(await checkReferences(a))];
  return { ok: problems.length === 0, problems };
};
