import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileWithRetry, writeFileWithVerify, isRetryableWriteError } from './fs-retry.js';
import type { RetryFs } from './fs-retry.js';

function busyError(): NodeJS.ErrnoException {
  const err = new Error('busy') as NodeJS.ErrnoException;
  err.code = 'EBUSY';
  return err;
}

describe('writeFileWithRetry', () => {
  it('retries EBUSY then succeeds', () => {
    let attempts = 0;
    const fsImpl: RetryFs = {
      writeFileSync: () => {
        attempts++;
        if (attempts < 3) throw busyError();
      },
      statSize: () => 4,
    };
    writeFileWithRetry('file.txt', 'data', { delayMs: 0 }, fsImpl);
    assert.equal(attempts, 3);
  });

  it('surfaces a persistent EBUSY after 5 attempts', () => {
    const fsImpl: RetryFs = {
      writeFileSync: () => {
        throw busyError();
      },
      statSize: () => null,
    };
    assert.throws(
      () => writeFileWithRetry('file.txt', 'data', { delayMs: 0, attempts: 5 }, fsImpl),
      /busy/,
    );
  });
});

describe('writeFileWithVerify', () => {
  it('reports success when the write persisted', () => {
    const fsImpl: RetryFs = {
      writeFileSync: () => undefined,
      statSize: () => 4,
    };
    const result = writeFileWithVerify('file.txt', 'data', {}, fsImpl);
    assert.equal(result.success, true);
  });

  it('detects a write that reports success but does not persist', () => {
    const fsImpl: RetryFs = {
      writeFileSync: () => undefined,
      statSize: () => null,
    };
    const result = writeFileWithVerify('file.txt', 'data', {}, fsImpl);
    assert.equal(result.success, false);
    assert.match(result.message, /missing/);
  });

  it('isRetryableWriteError recognizes EBUSY', () => {
    assert.equal(isRetryableWriteError(busyError()), true);
    assert.equal(isRetryableWriteError(new Error('nope')), false);
  });
});
