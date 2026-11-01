// How each language writes the comment an @atlas block lives in. Languages are grouped by
// comment style; one table maps a file to its style, and the parser, the stamper, the walker
// and the hooks all read it. A file with no style here (.json, .txt, images) can't carry a
// block: the stamp rules tag it by its path instead.

// How a fresh block is placed, for the languages that need more than the style says:
//   blankAfter — a blank line follows the block (reST ends a comment only at a blank line; in Go
//                a comment touching `package` becomes the package doc)
//   placeAfter — a block can only go below this opening (a PHP file that starts as HTML would
//                print a `/* */` block to the page, so it gets none)
type Placement = { blankAfter?: boolean; placeAfter?: RegExp };

// `block` styles wrap the axis lines in an opener and a closer; `line` styles prefix each one.
export type CommentStyle = Placement &
  (
    | {
        shape: 'block';
        // how a block opens and closes when reading (`/*` also finds `/**`) and when writing
        open: string;
        close: string;
        writeOpen: string;
        writeClose: string;
        // written before each axis line (` * `); AXIS_LINE reads past a leading `*`
        line: string;
      }
    // writePrefix: the form written when it differs from the shortest one read (`;;` in Lisp)
    | { shape: 'line'; prefix: string; writePrefix?: string }
  );

// Plain `/* */` is written for the C family because no language gives it a meaning, while `/**`
// is a doc comment in Rust (an error before `//!`), C#, Dart, Java and Go. JS/TS keep `/**`, the
// established convention (see LANGUAGE_RULES).
export const COMMENT_STYLES = {
  c: { shape: 'block', open: '/*', close: '*/', writeOpen: '/*', writeClose: ' */', line: ' * ' },
  html: {
    shape: 'block',
    open: '<!--',
    close: '-->',
    writeOpen: '<!--',
    writeClose: '-->',
    line: '',
  },
  // MDX 2+ rejects `<!-- -->`; its comment is a JS expression
  mdx: { shape: 'block', open: '{/*', close: '*/}', writeOpen: '{/*', writeClose: '*/}', line: '' },
  hash: { shape: 'line', prefix: '#' },
  slash: { shape: 'line', prefix: '//' },
  dash: { shape: 'line', prefix: '--' },
  semicolon: { shape: 'line', prefix: ';', writePrefix: ';;' },
  dotdot: { shape: 'line', prefix: '..', blankAfter: true },
} as const satisfies Record<string, CommentStyle>;

export type CommentStyleName = keyof typeof COMMENT_STYLES;

// Which files use each style. An entry starting with `.` is an extension (or a dotfile's whole
// name); anything else is an exact file name. Matching ignores case. Extend it from
// `.atlas/config.ts` with `comments: { hash: ['.nix'] }`.
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
    '.css',
    '.scss',
    '.less',
    '.php',
  ],
  html: ['.md', '.markdown', '.html', '.htm', '.xml', '.vue', '.svelte'],
  mdx: ['.mdx'],
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
    '.dockerfile',
    'Dockerfile',
    'Containerfile',
    'Makefile',
    'GNUmakefile',
    'Gemfile',
    'Rakefile',
    'Justfile',
    'Procfile',
  ],
  slash: ['.zig'],
  dash: ['.sql', '.lua', '.hs', '.elm'],
  semicolon: ['.clj', '.cljs', '.cljc', '.edn', '.lisp', '.el', '.scm', '.rkt'],
  dotdot: ['.rst'],
};

// Per table entry, where a language needs more than its style.
const JS_DOC = { writeOpen: '/**' } as const;
const LANGUAGE_RULES: Record<string, Placement & { writeOpen?: string }> = {
  '.ts': JS_DOC,
  '.tsx': JS_DOC,
  '.mts': JS_DOC,
  '.cts': JS_DOC,
  '.js': JS_DOC,
  '.jsx': JS_DOC,
  '.mjs': JS_DOC,
  '.cjs': JS_DOC,
  '.go': { blankAfter: true },
  '.php': { placeAfter: /^<\?php\b/m },
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
  const name = basename(path).toLowerCase();
  let best: { style: CommentStyleName; entry: string } | null = null;
  for (const style of Object.keys(table) as CommentStyleName[]) {
    for (const entry of table[style]) {
      const lower = entry.toLowerCase();
      if (lower === name) return { style, entry };
      if (lower.startsWith('.') && name.endsWith(lower)) {
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

// The style a file is written in, with its language's rules applied, or null when it can't hold
// a comment.
export const styleFor = (
  path: string,
  table: Required<CommentTable> = COMMENT_TABLE,
): CommentStyle | null => {
  const match = entryFor(path, table);
  if (!match) return null;
  const rules = LANGUAGE_RULES[match.entry.toLowerCase()];
  const style: CommentStyle = COMMENT_STYLES[match.style];
  return rules ? ({ ...style, ...rules } as CommentStyle) : style;
};

// Lines that must stay first in a file, so a fresh block goes below them. Each applies once, in
// this order, at the position the previous one left. A line may end the file with no newline.
type Preamble = { applies: (name: string) => boolean; pattern: RegExp };

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
};
const anyFile = (): boolean => true;
const withExtension =
  (...extensions: string[]) =>
  (name: string): boolean =>
    extensions.includes(extensionOf(name));
const isDockerfile = (name: string): boolean =>
  /^(docker|container)file\b/i.test(name) || extensionOf(name) === '.dockerfile';

const PREAMBLES: Preamble[] = [
  // `#!` but not Rust's `#![attribute]`
  { applies: anyFile, pattern: /^#!(?!\[)[^\n]*(?:\n|$)/ },
  // Emacs file variables (`-*- lexical-binding: t -*-`) only count on the first line. Only a
  // line that is whole on its own: `/* -*- mode: c -*-` opening a longer comment is not skipped,
  // or the block would land inside that comment.
  {
    applies: anyFile,
    pattern: /^(?![^\n]*(?:\/\*|<!--)(?![^\n]*(?:\*\/|-->)))[^\n]*-\*-[^\n]*-\*-[^\n]*(?:\n|$)/,
  },
  // Python's and Ruby's encoding line must be the first or second line
  {
    applies: withExtension('.py', '.pyi', '.rb'),
    pattern: /^#[^\n]*coding[:=][^\n]*(?:\n|$)/,
  },
  { applies: isDockerfile, pattern: /^(?:#[ \t]*[a-z]+=[^\n]*(?:\n|$))+/i },
  // Go build constraints: `// +build` must be preceded only by blank lines and line comments
  // (a copyright header), so a `/* */` block above it would switch it off. Everything up to the
  // last constraint line stays first; a file without one matches nothing here.
  {
    applies: withExtension('.go'),
    pattern:
      /^(?:(?:[ \t]*(?:\/\/[^\n]*)?\r?\n)*?(?:\/\/(?:go:build|[ \t]*\+build)[^\n]*(?:\r?\n|$))+)+(?:[ \t]*\r?\n)?/,
  },
  {
    applies: withExtension('.md', '.mdx', '.markdown'),
    pattern: /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,
  },
  { applies: anyFile, pattern: /^<\?xml[^\n]*\?>[ \t]*(?:\r?\n|$)/ },
  { applies: withExtension('.php'), pattern: /^<\?php\b[^\n]*(?:\n|$)/ },
  { applies: withExtension('.css', '.scss', '.less'), pattern: /^@charset[^\n]*(?:\n|$)/ },
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
