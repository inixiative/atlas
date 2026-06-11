# Example `.atlas/` config

Copy these three files into a **`.atlas/`** folder at your repo root, then adjust them to your
layout. This is the entire configuration surface — atlas ships the `@kind` defaults; **your repo
owns the concept registry.**

```
.atlas/
  kinds.ts    # @kind vocab — atlas's defaults, extended with any roles you add
  concepts.ts    # the concept registry — repo-OWNED, structure only (the one you'll edit most)
  config.ts   # stamp rules (path → tags), ignore globs, and reference resolvers
```

The key idea: atlas hardcodes **no** concept classes (`feature`/`primitive`/…) and **no** constituent
categories (`module`/`package`/`integration`/…). *You* define them — they're just the keys you use
in `concepts.ts` and reference from `config.ts`. atlas only validates that a `@partOf`/`@uses` names a
concept that exists, that a `@kind` is in your vocab, and that referenced docs/tickets resolve.

| File | You edit it… | Notes |
|------|--------------|-------|
| [`concepts.ts`](./concepts.ts) | constantly | add a concept when you add a feature/primitive; list its constituent folders so `@partOf` auto-fills |
| [`config.ts`](./config.ts) | rarely | structural globs → `@kind`; capture globs → `@partOf` via membership |
| [`kinds.ts`](./kinds.ts) | rarely | only when a role the defaults don't cover shows up |

After copying, `bunx atlas stamp --write` fills `@kind`/`@partOf` from the rules, `bunx atlas check`
gates it, and `bunx atlas generate` writes `MAP.md`.
