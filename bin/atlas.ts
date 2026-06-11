#!/usr/bin/env bun
import { runCli } from '../src/cli.ts';

const { code, out } = await runCli(process.argv.slice(2), { cwd: process.cwd() });
if (out) (code === 0 ? console.log : console.error)(out);
process.exit(code);
