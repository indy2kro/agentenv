#!/usr/bin/env node
/**
 * Per-file coverage floors. `node --test --test-coverage-*` can only gate the
 * overall totals, which lets one command file's branch coverage rot behind a
 * healthy average. This runs the compiled suite with coverage, parses the
 * report and fails when any non-test file drops below its floor.
 *
 * Files are keyed by their path under dist/ (`commands/apply.js`, `index.js`):
 * the report is a tree, and several files share a basename (`index.js`,
 * `output.js`), so a basename key would let one loosen another's floor.
 *
 * Run from cmd/agentenv after `npm run build` (npm run test:coverage:files).
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Floor for every file unless overridden below (percent). */
const DEFAULT_FLOOR = { lines: 80, branches: 75, functions: 70 };
/**
 * Files knowingly below the default, pinned about a point under where they are
 * today so they cannot slide further. A ratchet: raise these as tests land,
 * never lower them, and delete an entry once the file clears the default.
 */
const OVERRIDES = {
  'index.js': { lines: 76, branches: 49 },
  'adapters/base.js': { functions: 66 },
  'commands/apply.js': { lines: 79, branches: 63 },
  'commands/config-edit.js': { branches: 73 },
  'commands/setup.js': { branches: 67 },
  'commands/shell-fix.js': { branches: 63 },
  'commands/status.js': { branches: 71 },
  'commands/uninstall.js': { lines: 75, branches: 68 },
  'commands/wizard.js': { branches: 73 },
  'integrations/superpowers.js': { lines: 78 },
  'shell/detector.js': { lines: 77 },
};

/**
 * Parse Node's coverage table into `{ file, lines, branches, functions }` rows
 * keyed by path. A row with no numbers is a directory heading; the files under
 * it are indented one step further. Top-level files sit at the heading indent.
 */
export function parseCoverage(output) {
  const rows = [];
  let directory = '';
  const rowPattern = /^[ℹ#]?( *)(\S+)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|\s*([\d.]*)\s*\|/;
  for (const line of output.split(/\r?\n/)) {
    const match = rowPattern.exec(line);
    if (!match) continue;
    const [, indent, name, lines, branches, functions] = match;
    if (lines === '') {
      directory = name; // heading row, e.g. "adapters"
      continue;
    }
    if (!name.endsWith('.js') || name.endsWith('.test.js')) continue;
    const nested = indent.length >= 2 && directory !== '';
    rows.push({
      file: nested ? `${directory}/${name}` : name,
      lines: Number(lines),
      branches: Number(branches),
      functions: Number(functions),
    });
    if (!nested) directory = '';
  }
  return rows;
}

/** The failures (one string each) for rows that fall below their floor. */
export function checkFloors(rows, overrides = OVERRIDES, defaults = DEFAULT_FLOOR) {
  const failures = [];
  for (const row of rows) {
    const floor = { ...defaults, ...(overrides[row.file] ?? {}) };
    for (const metric of ['lines', 'branches', 'functions']) {
      if (row[metric] < floor[metric]) {
        failures.push(`${row.file}: ${metric} ${row[metric]}% < floor ${floor[metric]}%`);
      }
    }
  }
  return failures;
}

function main() {
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

  const rows = parseCoverage(output);
  if (rows.length === 0) {
    console.error('check-coverage: found no coverage rows; did the report format change?');
    process.exit(1);
  }
  const stale = Object.keys(OVERRIDES).filter((file) => !rows.some((row) => row.file === file));
  if (stale.length > 0) {
    console.error(`check-coverage: OVERRIDES names files not in the report: ${stale.join(', ')}`);
    process.exit(1);
  }
  const failures = checkFloors(rows);
  if (failures.length > 0) {
    console.error(`check-coverage: ${failures.length} floor(s) missed:`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log(`check-coverage: ${rows.length} files meet their per-file floors`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
