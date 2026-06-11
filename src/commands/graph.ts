import type { Analysis } from '../analyze.ts';
import { invert } from '../registry/invert.ts';

// The bidirectional indexes — "show me everything that touches caching" in one
// traversal. concept→files and concept→consumers come from the annotated tree;
// ticket→concepts and doc→concepts come from inverting the registry's reference fields.
export type Graph = {
  conceptToFiles: Record<string, string[]>; // via @partOf (membership)
  usesConsumers: Record<string, string[]>; // via @uses (dependency)
  fileToConcepts: Record<string, { partOf: string[]; uses: string[] }>;
  ticketToConcepts: Record<string, string[]>;
  docToConcepts: Record<string, string[]>;
};

const push = (rec: Record<string, string[]>, key: string, val: string): void => {
  (rec[key] ??= []).push(val);
};

export const graph = (a: Analysis): Graph => {
  const conceptToFiles: Record<string, string[]> = {};
  const usesConsumers: Record<string, string[]> = {};
  const fileToConcepts: Graph['fileToConcepts'] = {};

  for (const { path, annotation } of a.files) {
    if (!annotation) continue;
    fileToConcepts[path] = { partOf: annotation.partOf, uses: annotation.uses };
    for (const concept of annotation.partOf) push(conceptToFiles, concept, path);
    for (const concept of annotation.uses) push(usesConsumers, concept, path);
  }
  for (const key of Object.keys(conceptToFiles)) conceptToFiles[key]!.sort();
  for (const key of Object.keys(usesConsumers)) usesConsumers[key]!.sort();

  return {
    conceptToFiles,
    usesConsumers,
    fileToConcepts,
    ticketToConcepts: invert(a.config.concepts, 'tickets'),
    docToConcepts: invert(a.config.concepts, 'docs'),
  };
};
