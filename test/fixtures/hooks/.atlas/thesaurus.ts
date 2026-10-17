import type { Thesaurus } from '@inixiative/atlas';

export const THESAURUS: Thesaurus = {
  // its own doc, with a section
  'primitive:testFactories': {
    phrases: ['seed a user', 'fixture', 'fixture'],
    doc: 'TESTING.md#factories',
  },
  // no doc: defaults to the concept's first `docs:` entry
  'primitive:routeTemplates': { phrases: ['Make A Controller', 'lock', 'serialize'] },
  // no doc anywhere: no read line
  'feature:users': { phrases: ['GitHub', 'oauth', 'directory'] },
};
