import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { afterEach } from 'node:test';
import { isQuiet, setQuietEnabled } from './output.js';
import { withSpinner } from './spinner.js';
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
});
