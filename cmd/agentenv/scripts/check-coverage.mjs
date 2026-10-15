#!/usr/bin/env node
/**
 * Per-file coverage floors. `node --test --test-coverage-*` can only gate the
 * overall totals, which lets one command file's branch coverage rot behind a
 * healthy average. This runs the compiled suite with coverage, parses the
 * report and fails when any non-test file drops below its floor.
 *
 * Run from cmd/agentenv after `npm run build` (npm run test:coverage:files).
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Floor for every file unless overridden below (percent). */
const DEFAULT_FLOOR = { lines: 70, branches: 60, functions: 60 };
/** Files that are knowingly below the default; raise these as tests land, never lower them. */
const OVERRIDES = {
  'index.js': { branches: 50 },
};

const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage'], {
  cwd: distDir,
  encoding: 'utf-8',
  maxBuffer: 64 * 1024 * 1024,
});
const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
if (run.status !== 0) {
  process.stderr.write(output);
  console.error('\ncheck-coverage: the test run itself failed');
  process.exit(run.status ?? 1);
}

const rowPattern = /^[ℹ#]?\s*([\w.-]+\.js)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/;
const failures = [];
let checked = 0;
for (const line of output.split(/\r?\n/)) {
  const match = rowPattern.exec(line);
  if (!match) continue;
  const [, file, lines, branches, functions] = match;
  if (file.endsWith('.test.js')) continue;
  checked += 1;
  const floor = { ...DEFAULT_FLOOR, ...(OVERRIDES[file] ?? {}) };
  const actual = { lines: Number(lines), branches: Number(branches), functions: Number(functions) };
  for (const metric of ['lines', 'branches', 'functions']) {
    if (actual[metric] < floor[metric]) {
      failures.push(`${file}: ${metric} ${actual[metric]}% < floor ${floor[metric]}%`);
    }
  }
}

if (checked === 0) {
  console.error('check-coverage: found no coverage rows; did the report format change?');
  process.exit(1);
}
if (failures.length > 0) {
  console.error(`check-coverage: ${failures.length} file(s) below their floor:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`check-coverage: ${checked} files meet their per-file floors`);
