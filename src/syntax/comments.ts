// How each language writes the comment an @atlas block lives in. Languages are grouped by
// comment style; one table maps a file to its style, and the parser, the stamper, the walker
// and the hooks all read it. A file with no style here (.json, .txt, images) can't carry a
// block: the stamp rules tag it by its path instead.

// `block` styles wrap the axis lines in an opener and a closer; `line` styles prefix each one.
export type CommentStyle =
  | {
      shape: 'block';
      // how a block opens and closes when reading (`/*` also finds `/**`) and when writing
      open: string;
      close: string;
      writeOpen: string;
      writeClose: string;
      // written before each axis line; stripped (with any leading `*`) when reading
      line: string;
    }
  // blankAfter: the language ends a comment only at a blank line (reST warns "explicit markup
  // ends without a blank line"), so a fresh block is followed by one.
  | { shape: 'line'; prefix: string; blankAfter?: boolean };

export const COMMENT_STYLES = {
  c: { shape: 'block', open: '/*', close: '*/', writeOpen: '/**', writeClose: ' */', line: ' * ' },
  html: {
    shape: 'block',
    open: '<!--',
    close: '-->',
    writeOpen: '<!--',
    writeClose: '-->',
    line: '',
  },
  hash: { shape: 'line', prefix: '#' },
  dash: { shape: 'line', prefix: '--' },
  semicolon: { shape: 'line', prefix: ';' },
  dotdot: { shape: 'line', prefix: '..', blankAfter: true },
} as const satisfies Record<string, CommentStyle>;

export type CommentStyleName = keyof typeof COMMENT_STYLES;

// Which files use each style. An entry starting with `.` is an extension; anything else is an
// exact file name. Extend it from `.atlas/config.ts` with `comments: { hash: ['.nix'] }`.
export type CommentTable = Partial<Record<CommentStyleName, string[]>>;

export const COMMENT_TABLE: Required<CommentTable> = {
  c: [
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.go',
    '.java',
    '.kt',
    '.kts',
    '.rs',
    '.c',
    '.h',
    '.cc',
    '.cpp',
    '.hpp',
    '.cs',
    '.swift',
    '.scala',
    '.dart',
    '.groovy',
    '.proto',
    '.zig',
    '.css',
    '.scss',
    '.less',
    '.php',
  ],
  html: ['.md', '.mdx', '.markdown', '.html', '.htm', '.xml', '.vue', '.svelte'],
  hash: [
    '.py',
    '.pyi',
    '.rb',
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.yaml',
    '.yml',
    '.toml',
    '.ex',
    '.exs',
    '.r',
    '.pl',
    '.pm',
    '.tf',
    '.nix',
    '.cmake',
    '.ps1',
    'Dockerfile',
    'Makefile',
    'Gemfile',
    'Rakefile',
    'Justfile',
    'Procfile',
  ],
  dash: ['.sql', '.lua', '.hs', '.elm'],
  semicolon: ['.clj', '.cljs', '.cljc', '.edn', '.lisp', '.el', '.scm', '.rkt'],
  dotdot: ['.rst'],
};

// The table a repo runs with: atlas's, plus whatever `.atlas/config.ts` adds. An entry the repo
// lists under another style moves there.
export const mergeCommentTable = (extra: CommentTable = {}): Required<CommentTable> => {
  const moved = new Set(Object.values(extra).flat());
  const merged = {} as Required<CommentTable>;
  for (const name of Object.keys(COMMENT_TABLE) as CommentStyleName[]) {
    merged[name] = [
      ...COMMENT_TABLE[name].filter((entry) => !moved.has(entry)),
      ...(extra[name] ?? []),
    ];
  }
  return merged;
};

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

// The table entry a file matches (its style, and the `.ext` or name that decided it), or null
// when the file can't hold a comment. An exact file name wins, then the longest extension (so a
// later `.blade.php` entry can beat `.php`).
export const entryFor = (
  path: string,
  table: Required<CommentTable> = COMMENT_TABLE,
): { style: CommentStyleName; entry: string } | null => {
  const name = basename(path);
  let best: { style: CommentStyleName; entry: string } | null = null;
  for (const style of Object.keys(table) as CommentStyleName[]) {
    for (const entry of table[style]) {
      if (!entry.startsWith('.')) {
        if (entry === name) return { style, entry };
      } else if (name.endsWith(entry) && name.length > entry.length) {
        if (!best || entry.length > best.entry.length) best = { style, entry };
      }
    }
  }
  return best;
};

export const styleNameFor = (
  path: string,
  table: Required<CommentTable> = COMMENT_TABLE,
): CommentStyleName | null => entryFor(path, table)?.style ?? null;

export const styleFor = (
  path: string,
  table: Required<CommentTable> = COMMENT_TABLE,
): CommentStyle | null => {
  const name = styleNameFor(path, table);
  return name ? COMMENT_STYLES[name] : null;
};

// Lines that must stay first in a file, so a fresh block goes below them: a shebang, Python's
// encoding line, Dockerfile parser directives, Markdown front matter, an XML prolog, `<?php`,
// CSS `@charset`. Each applies once, in this order, at the position the previous one left.
type Preamble = { applies: (name: string) => boolean; pattern: RegExp };

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
};
const anyFile = (): boolean => true;
const withExtension =
  (...extensions: string[]) =>
  (name: string): boolean =>
    extensions.includes(extensionOf(name));

const PREAMBLES: Preamble[] = [
  { applies: anyFile, pattern: /^#![^\n]*\n/ },
  { applies: withExtension('.py', '.pyi'), pattern: /^#[^\n]*coding[:=][^\n]*\n/ },
  {
    applies: (name) => name.startsWith('Dockerfile'),
    pattern: /^(?:#[ \t]*[a-z]+=[^\n]*\n)+/,
  },
  {
    applies: withExtension('.md', '.mdx', '.markdown'),
    pattern: /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/,
  },
  { applies: anyFile, pattern: /^<\?xml[^\n]*\?>[ \t]*\r?\n/ },
  { applies: withExtension('.php'), pattern: /^<\?php[^\n]*\n/ },
  { applies: withExtension('.css', '.scss', '.less'), pattern: /^@charset[^\n]*\n/ },
];

// Where a fresh block is inserted: the offset just past the file's preamble.
export const preambleEnd = (path: string, source: string): number => {
  const name = basename(path);
  let at = 0;
  for (const { applies, pattern } of PREAMBLES) {
    if (!applies(name)) continue;
    at += pattern.exec(source.slice(at))?.[0].length ?? 0;
  }
  return at;
};
