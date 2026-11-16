#!/usr/bin/env node
/**
 * Points git at the committed hooks directory.
 *
 * Git hooks live in `.git/hooks`, which is not committed and does not travel
 * with a clone, so a hook nobody installs enforces nothing. `core.hooksPath`
 * moves that to a directory that is in the repository, at the cost of one
 * command per clone, which is this one.
 *
 * The path differs between the two repositories this app lives in: it is the
 * repository root in mindknowt-app, and a subdirectory in
 * nic-and-mag-studios. This works out which.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const hooks = join(process.cwd(), '.githooks');
if (!existsSync(hooks)) {
  console.error(`No .githooks directory at ${hooks}`);
  process.exit(1);
}

const value = relative(root, hooks) || '.githooks';
execFileSync('git', ['config', 'core.hooksPath', value], { cwd: root });
console.log(`core.hooksPath set to ${value}`);
console.log('Commits are now checked for British spellings before they land.');
