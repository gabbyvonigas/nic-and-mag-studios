/**
 * Runs every `tests/*.test.ts`, in its own process, and counts the checks.
 *
 * No framework. Each file is a script that asserts and prints, and the only
 * contract is its last line: "<n> checks passed". A file that throws, or that
 * does not print it, is a failure.
 *
 * These are off-device tests of the pure modules: what an alarm reconciles to,
 * what a completion covers, what a migration does to an older database. NFC
 * and AlarmKit cannot be exercised anywhere but a physical iPhone, and nothing
 * here pretends otherwise.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const tests = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests');
const files = readdirSync(tests).filter((f) => f.endsWith('.test.ts')).sort();

if (files.length === 0) {
  console.error('No tests found in tests/.');
  process.exit(1);
}

let total = 0;
const failed = [];

for (const file of files) {
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', '--import', './register.mjs', file],
    { cwd: tests, encoding: 'utf8' },
  );
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const counted = /^(\d+) checks passed$/m.exec(output);
  if (run.status !== 0 || !counted) {
    failed.push(file);
    console.log(`FAIL  ${file}`);
    console.log(output.trimEnd());
    continue;
  }
  total += Number(counted[1]);
  console.log(`ok    ${file} (${counted[1]})`);
}

console.log(
  `\n${files.length - failed.length} of ${files.length} files, ${total} checks passed.`,
);
if (failed.length > 0) {
  console.error(`Failing: ${failed.join(', ')}`);
  process.exit(1);
}
