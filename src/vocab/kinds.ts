// atlas default `@kind` vocabulary — the architectural role(s) a file plays.
//
// `@kind` answers "what is this?". Closed set, but the consumer EXTENDS it:
//   export const KINDS = [...DEFAULT_KINDS, 'job', 'migration'] as const
// atlas validates `@kind` values against the merged set the repo provides; it
// does not force this list on anyone. These are the near-universal SaaS roles.
//
// Role and seam are orthogonal: a db mutation-lifecycle "hook" is
// `@kind handler @partOf primitive:mutationLifecycle`, never a fused kind.
// `hook` here means a React hook (frontend) — the universal meaning.

export const DEFAULT_KINDS = [
  // ── backend / shared ──────────────────────────────────────────────────────
  'controller', // request handler in modules/*/controllers
  'route', // route definition in modules/*/routes
  'routeTemplate', // readRoute/createRoute/… in lib/routeTemplates
  'middleware', // middleware/*
  'handler', // handler — pair with @partOf (jobs, app-events, db mutation hooks)
  'helper', // small focused helper bound to a seam (vs generic `utils`)
  'service', // domain logic in modules/*/services and internal module parts
  'schema', // request/response schemas in modules/*/schemas
  'validator', // modules/*/validations
  'transformer', // value/shape transformers (serialize, normalize, project)
  'integration', // external-service integration
  'factory', // test factory (packages/db/src/test/factories)
  'constructor', // make*() factory producing a category of thing; pair with @constructs
  'registry', // a declarative config table (the registry pattern)
  'primitive', // a reusable building block's own implementation
  'infrastructure', // connection/client to an external dependency (redis, prisma, s3…)
  'entrypoint', // the way into a seam (ws/index, app bootstrap)
  'config', // configuration / env wiring
  'constant', // a closed set of literal values / lookup table, no behavioral hook
  'type', // a pure type-only module (no runtime), distinct from a Zod schema
  'seed', // db seed
  'utils', // generic helper; also the catch-all when path can't classify

  // ── frontend ────────────────────────────────────────────────────────────────
  'component', // reusable React component
  'page', // page/view component
  'hook', // React hook (use*)
  'store', // zustand store/slice
] as const;

export type DefaultKind = (typeof DEFAULT_KINDS)[number];
