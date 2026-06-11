import { check } from '@inixiative/json-rules';
import type { Analysis } from '../analyze.ts';

// A file flattened to its queryable axes. Unannotated files get empty arrays so
// "files with no @kind" style queries work too.
export type QueryRecord = { path: string; kind: string[]; partOf: string[]; uses: string[] };

// A json-rules predicate (the same AST the repo already uses for authz/filtering).
export type QueryRule = Parameters<typeof check>[0];

export const toQueryRecords = (a: Analysis): QueryRecord[] =>
  a.files.map((f) => ({
    path: f.path,
    kind: f.annotation?.kind ?? [],
    partOf: f.annotation?.partOf ?? [],
    uses: f.annotation?.uses ?? [],
  }));

export type QueryFlags = { kind?: string; partOf?: string; uses?: string; path?: string };

// Desugar the common flags into a json-rules predicate (AND of `contains`).
// Returns null when no flag is set (nothing to filter on).
export const flagsToRule = (flags: QueryFlags): QueryRule | null => {
  const clauses = (['kind', 'partOf', 'uses', 'path'] as const)
    .filter((f) => flags[f] !== undefined)
    .map((f) => ({ field: f, operator: 'contains', value: flags[f] }));
  if (clauses.length === 0) return null;
  return (clauses.length === 1 ? clauses[0] : { all: clauses }) as QueryRule;
};

// A record matches when json-rules `check` passes (it returns the error string otherwise).
export const queryFiles = (records: QueryRecord[], rule: QueryRule): QueryRecord[] =>
  records.filter((r) => check(rule, r) === true);
