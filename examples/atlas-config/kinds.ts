import { DEFAULT_KINDS } from '@inixiative/atlas';

// atlas ships a near-universal `@kind` vocab (controller, route, service, schema,
// handler, factory, registry, primitive, infrastructure, entrypoint, component,
// page, hook, store, …). Extend it with any roles specific to your codebase —
// adding a kind is a one-line edit. Keep it broad-but-closed.
export const KINDS = [...DEFAULT_KINDS, 'job', 'migration', 'seedScript'] as const;
