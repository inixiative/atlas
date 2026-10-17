#!/usr/bin/env bun
import { runCli } from '../src/cli.ts';

const { code, out } = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdin: () => Bun.stdin.text(),
  confirm: process.stdin.isTTY
    ? async (question) => {
        const answer = prompt(`${question} [Y/n]`);
        if (answer === null) return false;
        return answer.trim() === '' || /^y(es)?$/i.test(answer.trim());
      }
    : undefined,
});
if (out) (code === 0 ? console.log : console.error)(out);
process.exit(code);
