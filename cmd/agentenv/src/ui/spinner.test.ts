import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import { isQuiet, setQuietEnabled } from './output.js';
import { isSpinnerEnabled, setSpinnerEnabled, withSpinner } from './spinner.js';
import type { Spinner, SpinnerFactory } from './spinner.js';

function fakeSpinnerFactory(): { factory: SpinnerFactory; calls: string[] } {
  const calls: string[] = [];
  const spinner: Spinner = {
    start: () => {
      calls.push('start');
      return spinner;
    },
    succeed: (text?: string) => {
      calls.push(`succeed:${text ?? ''}`);
      return spinner;
    },
    fail: (text?: string) => {
      calls.push(`fail:${text ?? ''}`);
      return spinner;
    },
    stop: () => {
      calls.push('stop');
      return spinner;
    },
  };
  return { factory: () => spinner, calls };
}

describe('withSpinner', () => {
  it('starts the spinner, awaits fn, and succeeds when the result is successful', async () => {
    const { factory, calls } = fakeSpinnerFactory();
    const result = await withSpinner('Applying...', async () => ({ success: true }), factory);

    assert.deepEqual(result, { success: true });
    assert.deepEqual(calls, ['start', 'succeed:Applying...']);
  });

  it('fails the spinner when the result is unsuccessful, without throwing', async () => {
    const { factory, calls } = fakeSpinnerFactory();
    const result = await withSpinner('Applying...', async () => ({ success: false }), factory);

    assert.deepEqual(result, { success: false });
    assert.deepEqual(calls, ['start', 'fail:Applying...']);
  });

  it('fails the spinner and rethrows when fn throws', async () => {
    const { factory, calls } = fakeSpinnerFactory();
    await assert.rejects(
      withSpinner(
        'Applying...',
        async () => {
          throw new Error('boom');
        },
        factory,
      ),
      /boom/,
    );
    assert.deepEqual(calls, ['start', 'fail:Applying...']);
  });

  it('is a no-op under -q/--quiet so quiet output stays quiet on a TTY', async () => {
    afterEach(() => setQuietEnabled(false));
    setQuietEnabled(true);
    assert.equal(isQuiet(), true);
    const { factory, calls } = fakeSpinnerFactory();
    const result = await withSpinner('Applying...', async () => ({ success: true }), factory);
    assert.deepEqual(result, { success: true });
    assert.deepEqual(calls, [], 'quiet mode should never touch the real spinner');
  });

  it('always uses an explicitly injected factory, even when animation is disabled', async () => {
    setQuietEnabled(false);
    setSpinnerEnabled(false);
    try {
      const { factory, calls } = fakeSpinnerFactory();
      const result = await withSpinner('Applying...', async () => ({ success: true }), factory);
      assert.deepEqual(result, { success: true });
      assert.deepEqual(
        calls,
        ['start', 'succeed:Applying...'],
        'an injected factory (every test double) must never be silently swapped for staticSpinner',
      );
    } finally {
      setSpinnerEnabled(undefined);
    }
  });
});

describe('isSpinnerEnabled', () => {
  afterEach(() => setSpinnerEnabled(undefined));

  it('honors an explicit override in either direction', () => {
    setSpinnerEnabled(false);
    assert.equal(isSpinnerEnabled(), false);
    setSpinnerEnabled(true);
    assert.equal(isSpinnerEnabled(), true);
  });

  it('is off under TERM=dumb by default', () => {
    const originalTerm = process.env.TERM;
    process.env.TERM = 'dumb';
    try {
      assert.equal(isSpinnerEnabled(), false);
    } finally {
      if (originalTerm === undefined) delete process.env.TERM;
      else process.env.TERM = originalTerm;
    }
  });

  it('is off under CI by default', () => {
    const originalCi = process.env.CI;
    process.env.CI = 'true';
    try {
      assert.equal(isSpinnerEnabled(), false);
    } finally {
      if (originalCi === undefined) delete process.env.CI;
      else process.env.CI = originalCi;
    }
  });
});

describe('withSpinner static (non-animated) fallback', () => {
  afterEach(() => setSpinnerEnabled(undefined));

  it('prints the label and a succeed/fail line instead of animating, using the real ora-default seam', async () => {
    setQuietEnabled(false);
    setSpinnerEnabled(false);
    const logs: string[] = [];
    const original = console.log;
    console.log = (message?: unknown) => logs.push(String(message));
    try {
      const ok = await withSpinner('Applying...', async () => ({ success: true }));
      assert.deepEqual(ok, { success: true });
      assert.ok(logs.some((line) => line === 'Applying...'));
      assert.ok(logs.some((line) => line.includes('Applying...') && line !== 'Applying...'));

      logs.length = 0;
      const failed = await withSpinner('Applying...', async () => ({ success: false }));
      assert.deepEqual(failed, { success: false });
      assert.ok(logs.some((line) => line === 'Applying...'));
    } finally {
      console.log = original;
    }
  });
});
