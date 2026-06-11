// atlas default `@kind` vocabulary — the ROLE a file plays ("what is this?").
//
// Closed set, but the consumer EXTENDS it:
//   export const KINDS = [...DEFAULT_KINDS, 'job', 'migration'] as const
// atlas validates `@kind` against the merged set the repo provides; it does not
// force this list on anyone. These are near-universal file roles.
//
// IMPORTANT — kind is a ROLE, not a LAYER. The architectural layer is the concept
// CLASS (the `class:` prefix), expressed via @partOf, never via @kind. So a file
// is NOT `@kind infrastructure`; it's e.g. `@kind client @partOf infrastructure:redis`,
// and a building block is `@kind <role> @partOf primitive:caching`. That's why
// `primitive`/`infrastructure`/`registry`/`routeTemplate` are NOT kinds here.

export const DEFAULT_KINDS = [
  // ── backend / shared ──────────────────────────────────────────────────────
  'controller', // request handler in modules/*/controllers
  'route', // route definition in modules/*/routes
  'middleware', // middleware/*
  'handler', // handler — pair with @partOf (jobs, app-events, db mutation hooks)
  'helper', // small focused helper bound to a concept (vs generic `utils`)
  'service', // domain logic in modules/*/services and internal module parts
  'schema', // request/response schemas in modules/*/schemas
  'validator', // modules/*/validations
  'transformer', // value/shape transformers (serialize, normalize, project)
  'client', // a connection/client to an external dependency (redis, prisma, s3…)
  'adapter', // an implementation of an interface behind a port (the adapter pattern)
  'integration', // glue to an external service (webhooks, oauth handshakes, SDK wrappers)
  'factory', // test factory (packages/db/src/test/factories)
  'constructor', // make*() factory producing a category of thing; pair with @constructs
  'entrypoint', // the way into a concept (ws/index, app bootstrap)
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
