import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDuration,
  printConfigPath,
  printResult,
  reportValidation,
  timingPhrase,
} from './report.js';

interface Captured {
  out: string[];
  err: string[];
}

function capture(run: () => void): Captured {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (message?: unknown) => {
    out.push(String(message));
  };
  console.error = (message?: unknown) => {
    err.push(String(message));
  };
  try {
    run();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { out, err };
}

describe('formatDuration', () => {
  it('renders sub-second durations in milliseconds', () => {
    assert.equal(formatDuration(0), '0ms');
    assert.equal(formatDuration(850), '850ms');
    assert.equal(formatDuration(999), '999ms');
  });

  it('renders seconds with one decimal place', () => {
    assert.equal(formatDuration(1000), '1.0s');
    assert.equal(formatDuration(3450), '3.5s');
    assert.equal(formatDuration(59900), '59.9s');
  });

  it('renders minutes and seconds past a minute', () => {
    assert.equal(formatDuration(60000), '1m 0s');
    assert.equal(formatDuration(125000), '2m 5s');
  });

  it('clamps non-positive or non-finite input to 0ms', () => {
    assert.equal(formatDuration(-5), '0ms');
    assert.equal(formatDuration(Number.NaN), '0ms');
    assert.equal(formatDuration(Number.POSITIVE_INFINITY), '0ms');
  });
});

describe('timingPhrase', () => {
  it('says "failed" for a fail outcome and "finished" otherwise', () => {
    assert.equal(timingPhrase('fail', 2100), 'failed in 2.1s');
    assert.equal(timingPhrase('ok', 2100), 'finished in 2.1s');
    assert.equal(timingPhrase('warn', 2100), 'finished in 2.1s');
  });
});

describe('printConfigPath', () => {
  it('prints the one shared config-path line', () => {
    const { out } = capture(() => printConfigPath('/tmp/agentenv.toml'));
    assert.deepEqual(out, ['Config: /tmp/agentenv.toml']);
  });
});

describe('reportValidation', () => {
  it('prints warnings, errors, and the not-applying line; returns false', () => {
    const { out, err } = capture(() =>
      reportValidation(
        { warnings: ['floating ref'], errors: ['bad tool'] },
        'Configuration invalid — not applying.',
      ),
    );
    assert.equal(out.length, 1);
    assert.match(out[0], /warning: floating ref/);
    assert.equal(err.length, 2);
    assert.match(err[0], /error: bad tool/);
    assert.match(err[1], /Configuration invalid — not applying\./);
  });

  it('returns true and prints warnings only for a clean report', () => {
    const { out, err } = capture(() =>
      reportValidation(
        { warnings: ['floating ref'], errors: [] },
        'Configuration invalid — not applying.',
      ),
    );
    assert.equal(out.length, 1);
    assert.equal(err.length, 0);
  });
});

describe('printResult', () => {
  it('appends the elapsed-time line when a duration is given', () => {
    const originalIsTTY = process.stdout.isTTY;
    let captured: Captured;
    try {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
      captured = capture(() => printResult('ok', 'Apply complete!', 'all good', 3400));
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    }
    const joined = captured.out.join('\n');
    assert.match(joined, /Apply complete!/);
    assert.match(joined, /finished in 3\.4s/);
  });

  it('omits the timing line when no duration is given', () => {
    const originalIsTTY = process.stdout.isTTY;
    let captured: Captured;
    try {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
      captured = capture(() => printResult('ok', 'Apply complete!', 'all good'));
    } finally {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    }
    assert.doesNotMatch(captured.out.join('\n'), /finished in|failed in/);
  });
});
