import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

interface Row {
  file: string;
  lines: number;
  branches: number;
  functions: number;
}
interface CoverageScript {
  parseCoverage(output: string): Row[];
  checkFloors(
    rows: Row[],
    overrides?: Record<string, Partial<Row>>,
    defaults?: { lines: number; branches: number; functions: number },
  ): string[];
}

// dist/utils -> cmd/agentenv/scripts
const scriptUrl = pathToFileURL(
  path.join(import.meta.dirname, '..', '..', 'scripts', 'check-coverage.mjs'),
).href;
const load = async (): Promise<CoverageScript> => (await import(scriptUrl)) as CoverageScript;

const REPORT = [
  'ℹ start of coverage report',
  'ℹ file                | line % | branch % | funcs % | uncovered lines',
  'ℹ adapters            |        |          |         | ',
  'ℹ  base.js            |  92.86 |   100.00 |   66.67 | 25-26',
  'ℹ  index.js           | 100.00 |   100.00 |  100.00 | ',
  'ℹ  claude.test.js     |  99.00 |    99.00 |   99.00 | ',
  'ℹ commands            |        |          |         | ',
  'ℹ  apply.js           |  80.04 |    64.63 |   80.00 | 183-192',
  'ℹ index.js            |  77.50 |    50.00 |  100.00 | 61-78',
  'ℹ integrations        |        |          |         | ',
  'ℹ  index.js           | 100.00 |   100.00 |  100.00 | ',
  'ℹ all files           |  88.11 |    84.59 |   89.10 | ',
].join('\n');

describe('check-coverage', () => {
  it('keys files by path, so same-named files stay distinct, and skips tests and totals', async () => {
    const { parseCoverage } = await load();
    const files = parseCoverage(REPORT).map((row) => row.file);
    assert.deepEqual(files, [
      'adapters/base.js',
      'adapters/index.js',
      'commands/apply.js',
      'index.js',
      'integrations/index.js',
    ]);
  });

  it('reads the three percentages for a file', async () => {
    const { parseCoverage } = await load();
    const apply = parseCoverage(REPORT).find((row) => row.file === 'commands/apply.js');
    assert.deepEqual(apply, {
      file: 'commands/apply.js',
      lines: 80.04,
      branches: 64.63,
      functions: 80,
    });
  });

  it("an override for the top-level index.js does not loosen another directory's index.js", async () => {
    const { parseCoverage, checkFloors } = await load();
    const failures = checkFloors(parseCoverage(REPORT), {
      'index.js': { branches: 49, lines: 76 },
    });
    assert.ok(!failures.some((f) => f.startsWith('index.js:')), failures.join('; '));
    // …and the same numbers on a different index.js would still be caught.
    const sneaky = [{ file: 'adapters/index.js', lines: 77.5, branches: 50, functions: 100 }];
    assert.ok(checkFloors(sneaky, { 'index.js': { branches: 49, lines: 76 } }).length > 0);
  });

  it('reports each metric that misses its floor, naming the file', async () => {
    const { parseCoverage, checkFloors } = await load();
    const failures = checkFloors(parseCoverage(REPORT), {});
    assert.ok(
      failures.includes('commands/apply.js: branches 64.63% < floor 75%'),
      failures.join('; '),
    );
    assert.ok(failures.includes('adapters/base.js: functions 66.67% < floor 70%'));
  });
});
