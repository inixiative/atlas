import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { COMMENT_STYLES, COMMENT_TABLE } from '../src/syntax/comments.ts';

// The README's comment-style table is the user's view of COMMENT_TABLE; it must list the same files.
describe('README comment-style table', () => {
  test('lists every style with exactly the files the code maps to it', async () => {
    const readme = await Bun.file(resolve(import.meta.dir, '../README.md')).text();
    for (const style of Object.keys(COMMENT_STYLES) as (keyof typeof COMMENT_TABLE)[]) {
      const row = readme.split('\n').find((line) => line.startsWith(`| \`${style}\``));
      const files = [...(row?.split('|')[3] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      expect({ style, files }).toEqual({ style, files: COMMENT_TABLE[style] });
    }
  });
});
