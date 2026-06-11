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
