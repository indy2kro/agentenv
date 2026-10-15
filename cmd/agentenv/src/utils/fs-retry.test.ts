import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  atomicWriteFileSync,
  backupBeforeFirstEdit,
  writeFileWithRetry,
  writeFileWithVerify,
  isRetryableWriteError,
} from './fs-retry.js';
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

describe('backupBeforeFirstEdit', () => {
  function tempFile(content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-backup-'));
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, content);
    return file;
  }

  it('copies the current content to <file>.agentenv-backup', () => {
    const file = tempFile('{"original":true}');
    backupBeforeFirstEdit(file);
    assert.equal(fs.readFileSync(`${file}.agentenv-backup`, 'utf8'), '{"original":true}');
  });

  it('never overwrites an existing backup on a later call', () => {
    const file = tempFile('{"original":true}');
    backupBeforeFirstEdit(file);
    fs.writeFileSync(file, '{"agentenv-modified":true}');
    backupBeforeFirstEdit(file);
    assert.equal(fs.readFileSync(`${file}.agentenv-backup`, 'utf8'), '{"original":true}');
  });

  it('is a no-op when the file does not exist yet (nothing to back up)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-backup-'));
    const file = path.join(dir, 'does-not-exist.json');
    backupBeforeFirstEdit(file);
    assert.equal(fs.existsSync(`${file}.agentenv-backup`), false);
  });
});

describe('atomicWriteFileSync', () => {
  it('replaces content and leaves no temp files behind', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-atomic-'));
    try {
      const file = path.join(dir, 'settings.json');
      fs.writeFileSync(file, 'old');
      atomicWriteFileSync(file, 'new');
      assert.equal(fs.readFileSync(file, 'utf-8'), 'new');
      assert.deepEqual(fs.readdirSync(dir), ['settings.json']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates a missing file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-atomic-'));
    try {
      const file = path.join(dir, 'new.toml');
      atomicWriteFileSync(file, 'x');
      assert.equal(fs.readFileSync(file, 'utf-8'), 'x');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes through a symlink instead of replacing it', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-atomic-'));
    try {
      const real = path.join(dir, 'real.json');
      const link = path.join(dir, 'link.json');
      fs.writeFileSync(real, 'old');
      try {
        fs.symlinkSync(real, link);
      } catch {
        t.skip('symlinks not permitted here');
        return;
      }
      atomicWriteFileSync(link, 'new');
      assert.ok(fs.lstatSync(link).isSymbolicLink());
      assert.equal(fs.readFileSync(real, 'utf-8'), 'new');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
