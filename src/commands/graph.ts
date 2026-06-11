import type { Analysis } from '../analyze.ts';
import { invert } from '../registry/invert.ts';

// The bidirectional indexes — "show me everything that touches caching" in one
// traversal. seam→files and seam→consumers come from the annotated tree;
// ticket→seams and doc→seams come from inverting the registry's reference fields.
export type Graph = {
  seamToFiles: Record<string, string[]>; // via @partOf (membership)
  usesConsumers: Record<string, string[]>; // via @uses (dependency)
  fileToSeams: Record<string, { partOf: string[]; uses: string[] }>;
  ticketToSeams: Record<string, string[]>;
  docToSeams: Record<string, string[]>;
};

const push = (rec: Record<string, string[]>, key: string, val: string): void => {
  (rec[key] ??= []).push(val);
};

export const graph = (a: Analysis): Graph => {
  const seamToFiles: Record<string, string[]> = {};
  const usesConsumers: Record<string, string[]> = {};
  const fileToSeams: Graph['fileToSeams'] = {};

  for (const { path, annotation } of a.files) {
    if (!annotation) continue;
    fileToSeams[path] = { partOf: annotation.partOf, uses: annotation.uses };
    for (const seam of annotation.partOf) push(seamToFiles, seam, path);
    for (const seam of annotation.uses) push(usesConsumers, seam, path);
  }
  for (const key of Object.keys(seamToFiles)) seamToFiles[key]!.sort();
  for (const key of Object.keys(usesConsumers)) usesConsumers[key]!.sort();

  return {
    seamToFiles,
    usesConsumers,
    fileToSeams,
    ticketToSeams: invert(a.config.seams, 'tickets'),
    docToSeams: invert(a.config.seams, 'docs'),
  };
};
