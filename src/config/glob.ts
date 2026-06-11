// Glob matcher for stamp `include` patterns and `ignore` lists, with the
// capture syntax atlas adds on top of ordinary globbing:
//   *    — match one segment, DISCARD
//   **   — match many segments, DISCARD  (trailing `/` makes it optional)
//   $1.. — match one segment, CAPTURE, referenced by tag values / partOfFor
// You number only what you capture, in order of appearance, so `**` is never a
// capture and the multi-segment ambiguity disappears.

export type Captures = Record<number, string>;

const escapeChar = (c: string): string => (/[.+^${}()|[\]\\/]/.test(c) ? `\\${c}` : c);

// Translate one brace-alternation option, honouring `*`/`?` within it (so
// `{j*,ts}` matches `js`) rather than escaping them to literals.
const translateOption = (opt: string): string =>
  [...opt].map((c) => (c === '*' ? '[^/]*' : c === '?' ? '[^/]' : escapeChar(c))).join('');

const globToRegex = (pattern: string): { re: RegExp; captureNums: number[] } => {
  const captureNums: number[] = [];
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i]!;
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?'; // **/ — optional, so it matches at the root too
          i += 3;
        } else {
          re += '.*'; // ** — across segments
          i += 2;
        }
      } else {
        re += '[^/]*'; // * — within a segment
        i += 1;
      }
    } else if (c === '$' && /\d/.test(pattern[i + 1] ?? '')) {
      let j = i + 1;
      let num = '';
      while (j < pattern.length && /\d/.test(pattern[j]!)) num += pattern[j++];
      re += '([^/]+)';
      captureNums.push(Number.parseInt(num, 10));
      i = j;
    } else if (c === '{') {
      const end = pattern.indexOf('}', i);
      if (end > i) {
        const opts = pattern
          .slice(i + 1, end)
          .split(',')
          .map(translateOption)
          .join('|');
        re += `(?:${opts})`;
        i = end + 1;
      } else {
        re += '\\{';
        i += 1;
      }
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else {
      re += escapeChar(c);
      i += 1;
    }
  }
  return { re: new RegExp(`${re}$`), captureNums };
};

// Returns the captures keyed by their `$n` number (`{}` when matched with no
// captures), or null when the path does not match the pattern.
export const matchGlob = (pattern: string, path: string): Captures | null => {
  const { re, captureNums } = globToRegex(pattern);
  const m = re.exec(path);
  if (!m) return null;
  const caps: Captures = {};
  captureNums.forEach((n, idx) => {
    caps[n] = m[idx + 1]!;
  });
  return caps;
};

export const matchesAny = (patterns: string[], path: string): boolean =>
  patterns.some((p) => matchGlob(p, path) !== null);
