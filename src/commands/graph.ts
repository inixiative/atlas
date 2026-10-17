import type { Analysis } from '../analyze.ts';
import { invert } from '../registry/invert.ts';

// The bidirectional indexes — "show me everything that touches caching" in one
// traversal. concept→files and concept→consumers come from the annotated tree;
// doc→concepts comes from inverting the registry's `docs` reference field.
export type Graph = {
  conceptToFiles: Record<string, string[]>; // via @partOf (membership)
  usesConsumers: Record<string, string[]>; // via @uses (dependency)
  fileToConcepts: Record<string, { kind: string[]; partOf: string[]; uses: string[] }>;
  docToConcepts: Record<string, string[]>;
  thesaurus: Record<string, { phrases: string[]; doc?: string }>; // doc resolved to a repo path
};

const push = (rec: Record<string, string[]>, key: string, val: string): void => {
  rec[key] ??= [];
  rec[key].push(val);
};

// Split `FILE.md#section` so only the file goes through the `references.docs` resolver.
export const splitDoc = (doc: string): { file: string; section?: string } => {
  const hash = doc.indexOf('#');
  return hash < 0 ? { file: doc } : { file: doc.slice(0, hash), section: doc.slice(hash + 1) };
};

// The doc a thesaurus entry points at, as a repo path: its own `doc`, else the concept's first
// `docs:` entry, through the same resolver `atlas check` uses (identity when none is set).
const resolvedThesaurus = (a: Analysis): Graph['thesaurus'] => {
  const resolver = a.config.references.docs ?? ((value: string) => value);
  return Object.fromEntries(
    Object.entries(a.config.thesaurus).map(([concept, entry]) => {
      const doc = entry.doc ?? a.config.concepts[concept]?.docs?.[0];
      if (doc === undefined) return [concept, { phrases: entry.phrases }];
      const { file, section } = splitDoc(doc);
      try {
        const path = resolver(file);
        return [concept, { phrases: entry.phrases, doc: section ? `${path}#${section}` : path }];
      } catch {
        return [concept, { phrases: entry.phrases }]; // `atlas check` reports the throw
      }
    }),
  );
};

export const graph = (a: Analysis): Graph => {
  const conceptToFiles: Record<string, string[]> = {};
  const usesConsumers: Record<string, string[]> = {};
  const fileToConcepts: Graph['fileToConcepts'] = {};

  for (const { path, annotation } of a.files) {
    if (!annotation) continue;
    fileToConcepts[path] = {
      kind: annotation.kind,
      partOf: annotation.partOf,
      uses: annotation.uses,
    };
    for (const concept of annotation.partOf) push(conceptToFiles, concept, path);
    for (const concept of annotation.uses) push(usesConsumers, concept, path);
  }
  for (const key of Object.keys(conceptToFiles)) conceptToFiles[key]!.sort();
  for (const key of Object.keys(usesConsumers)) usesConsumers[key]!.sort();

  return {
    conceptToFiles,
    usesConsumers,
    fileToConcepts,
    docToConcepts: invert(a.config.concepts, 'docs'),
    thesaurus: resolvedThesaurus(a),
  };
};
