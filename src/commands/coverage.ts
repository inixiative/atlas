import type { Analysis } from '../analyze.ts';
import { stampFor } from '../config/stamp.ts';

// The signal you lose the moment you auto-stamp `@uses none` everywhere: absence
// (uncurated) is distinct from explicit-empty (curated), and a patcher proposal
// is distinct from both.
export type Coverage = {
  total: number;
  annotated: number;
  unannotated: string[];
  uses: {
    uncurated: string[]; // no @uses line — nobody filled it in
    curatedEmpty: string[]; // explicit @uses none — a human looked, it uses nothing
    proposed: string[]; // tentative @uses? — patcher proposed, awaiting acceptance
    curated: string[]; // real @uses values
  };
  // membership captures (partOfFor) that matched no seam — fillable signal, not an error.
  unresolved: { file: string; category: string; value: string }[];
};

// A CI gate over a coverage snapshot. `min` is a percentage floor; `ratchet` is
// a backslide guard — the unannotated count may not exceed a committed baseline,
// which is how a repo starting near 0% enforces "every new file is annotated"
// without demanding an unreachable percentage on day one.
export type CoverageGate = { min?: number; ratchet?: number };
export type GateResult = { ok: boolean; reasons: string[]; percent: number };

export const evaluateCoverageGate = (c: Coverage, gate: CoverageGate): GateResult => {
  const percent = c.total === 0 ? 100 : (c.annotated / c.total) * 100;
  const reasons: string[] = [];
  if (gate.min !== undefined && percent < gate.min) {
    reasons.push(`coverage ${percent.toFixed(1)}% is below the --min ${gate.min}% floor`);
  }
  if (gate.ratchet !== undefined && c.unannotated.length > gate.ratchet) {
    reasons.push(
      `unannotated files rose to ${c.unannotated.length} (baseline ${gate.ratchet}) — annotate the new files or run --update-baseline`,
    );
  }
  return { ok: reasons.length === 0, reasons, percent };
};

// Baseline file holds just the unannotated count: { "unannotated": <n> }.
export const readBaseline = async (path: string): Promise<number | null> => {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const data = (await file.json()) as { unannotated?: number };
  return typeof data.unannotated === 'number' ? data.unannotated : null;
};

export const coverage = (a: Analysis): Coverage => {
  const unannotated: string[] = [];
  const uses = { uncurated: [] as string[], curatedEmpty: [] as string[], proposed: [] as string[], curated: [] as string[] };
  const unresolved: Coverage['unresolved'] = [];

  for (const { path, annotation } of a.files) {
    if (!annotation) {
      unannotated.push(path);
    } else {
      const bucket =
        annotation.usesState === 'absent'
          ? uses.uncurated
          : annotation.usesState === 'none'
            ? uses.curatedEmpty
            : annotation.usesState === 'proposed'
              ? uses.proposed
              : uses.curated;
      bucket.push(path);
    }
    for (const u of stampFor(path, a.config.stamp, a.config.seams).unresolved) {
      unresolved.push({ file: path, category: u.category, value: u.value });
    }
  }

  return { total: a.files.length, annotated: a.files.length - unannotated.length, unannotated, uses, unresolved };
};
