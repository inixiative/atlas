import { DEFAULT_KINDS } from '@inixiative/atlas';

// Consumer extends atlas's defaults with its own role.
export const KINDS = [...DEFAULT_KINDS, 'job'] as const;
