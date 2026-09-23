/**
 * Windows file-lock resilient writes (Tasks 8 & 13 of the Windows Shell
 * Compatibility Overhaul plan).
 *
 * On Windows an open/locked file (editor, AV scan, another agentenv) makes
 * `fs.writeFileSync` throw EBUSY/EPERM immediately. `writeFileWithRetry`
 * retries those codes with a short backoff instead of failing the first try.
 * `writeFileWithVerify` additionally confirms the write actually persisted
 * (existence + size), so a locking/AV failure that quietly didn't persist is
 * reported truthfully.
 *
 * The fs interface is injectable so tests can model "throws EBUSY twice then
 * succeeds" and "reports success but file is missing" without touching the
 * real filesystem.
 */

import * as fs from 'fs';

export interface RetryFs {
  writeFileSync: (filePath: string, content: string) => void;
  statSize: (filePath: string) => number | null;
}

export const defaultRetryFs: RetryFs = {
  writeFileSync: (filePath, content) => fs.writeFileSync(filePath, content),
  statSize: (filePath) => {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return null;
    }
  },
};

export interface WriteRetryOptions {
  /** Max write attempts (default 5). */
  attempts?: number;
  /** Backoff between attempts in milliseconds (default 25). */
  delayMs?: number;
  /** Skip retrying: throw on the first write error (test escape hatch). */
  failFast?: boolean;
}

const DEFAULT_ATTEMPTS = 5;
const DEFAULT_DELAY_MS = 25;

/** True when an error means "the file is temporarily locked", worth retrying. */
export function isRetryableWriteError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === 'EBUSY') return true;
  return code === 'EPERM' && process.platform === 'win32';
}

function sleepSync(ms: number): void {
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

/**
 * Write `content` to `filePath`, retrying briefly on Windows file-lock errors
 * (EBUSY/EPERM). Throws when the write ultimately cannot succeed.
 */
export function writeFileWithRetry(
  filePath: string,
  content: string,
  opts: WriteRetryOptions = {},
  fsImpl: RetryFs = defaultRetryFs,
): void {
  const attempts = opts.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      fsImpl.writeFileSync(filePath, content);
      return;
    } catch (err) {
      if (opts.failFast === true || attempt === attempts || !isRetryableWriteError(err)) {
        throw err;
      }
      if (delayMs > 0) sleepSync(delayMs);
    }
  }
}

/**
 * Back up `filePath`'s current content to `<filePath>.agentenv-backup` the
 * first time agentenv is about to modify a file it did not create — a
 * user-global file like ~/.claude/settings.json or a pre-existing user-scope
 * CLAUDE.md/AGENTS.md. Tier 0's shell-fix writes to these same kinds of
 * files already have an undo path (shell-fix-state.json); the adapters'
 * writes did not.
 *
 * Never overwrites an existing backup — once one exists it holds the user's
 * true pre-agentenv content, and a later call (a second `apply`) must not
 * clobber it with agentenv's own already-modified content. A no-op when
 * `filePath` doesn't exist yet (nothing to back up: this is a fresh file
 * agentenv is creating, not modifying). Backing up is advisory: a failure
 * here (e.g. a locked filesystem) must never block the real write.
 */
export function backupBeforeFirstEdit(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const backupPath = `${filePath}.agentenv-backup`;
    if (fs.existsSync(backupPath)) return;
    fs.copyFileSync(filePath, backupPath);
  } catch {
    // Advisory only — never block the real write on a failed backup.
  }
}

export interface WriteVerifyResult {
  success: boolean;
  message: string;
}

/**
 * Write `content` and confirm it persisted: the file must exist after the
 * write, and, for non-empty content, be non-empty. Any mismatch is reported as
 * a failure message instead of a bare silent success.
 */
export function writeFileWithVerify(
  filePath: string,
  content: string,
  opts: WriteRetryOptions = {},
  fsImpl: RetryFs = defaultRetryFs,
): WriteVerifyResult {
  try {
    writeFileWithRetry(filePath, content, opts, fsImpl);
  } catch (err) {
    return {
      success: false,
      message: `Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const size = fsImpl.statSize(filePath);
  if (size === null) {
    return {
      success: false,
      message: `Write to ${filePath} reported success but the file is missing`,
    };
  }
  if (content.length > 0 && size === 0) {
    return {
      success: false,
      message: `Write to ${filePath} reported success but the file is empty`,
    };
  }
  return { success: true, message: '' };
}
