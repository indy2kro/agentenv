import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearShellFixState,
  mergeShellFixEntries,
  readShellFixState,
  writeShellFixState,
  type ShellFixState,
  type ShellFixStateEntry,
} from './shell-fix-state.js';

function tempStatePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-shellstate-'));
  return path.join(dir, 'nested', 'shell-fix-state.json');
}

function entry(file: string, overrides: Partial<ShellFixStateEntry> = {}): ShellFixStateEntry {
  return {
    agent: 'claude_code',
    file,
    createdFile: true,
    fields: [{ key: 'env.CLAUDE_CODE_GIT_BASH_PATH', previous: null }],
    ...overrides,
  };
}

describe('shell fix state manifest', () => {
  it('read returns null when the file is absent', () => {
    assert.equal(readShellFixState(tempStatePath()), null);
  });

  it('write/read round-trips and read is tolerant of garbage', () => {
    const statePath = tempStatePath();
    const state: ShellFixState = {
      version: 1,
      bashExe: 'C:\\Git\\bash.exe',
      recordedAt: '2026-09-19T00:00:00.000Z',
      entries: [entry('C:\\a.json')],
    };
    writeShellFixState(state, statePath);
    assert.deepEqual(readShellFixState(statePath), state);

    fs.writeFileSync(statePath, '{not json');
    assert.equal(readShellFixState(statePath), null);

    fs.writeFileSync(statePath, JSON.stringify({ version: 2, entries: [] }));
    assert.equal(readShellFixState(statePath), null);
  });

  it('clear removes the file and is a no-op when absent', () => {
    const statePath = tempStatePath();
    writeShellFixState({ version: 1, bashExe: 'x', recordedAt: 't', entries: [] }, statePath);
    clearShellFixState(statePath);
    assert.equal(fs.existsSync(statePath), false);
    clearShellFixState(statePath);
  });

  it('merge adds new files and keeps the original prior value for known fields', () => {
    const first = entry('C:\\a.json', {
      fields: [{ key: 'env.CLAUDE_CODE_GIT_BASH_PATH', previous: 'orig' }],
    });
    const existing = mergeShellFixEntries(null, [first], 'new-bash');

    const later = entry('C:\\a.json', {
      fields: [{ key: 'env.CLAUDE_CODE_GIT_BASH_PATH', previous: 'later' }],
    });
    const merged = mergeShellFixEntries(existing, [later], 'new-bash');

    assert.equal(merged.entries.length, 1);
    assert.equal(merged.entries[0].fields[0].previous, 'orig');
    assert.equal(merged.bashExe, 'new-bash');
  });

  it('merge adds fields not seen before and keeps createdFile sticky', () => {
    const existing = mergeShellFixEntries(null, [entry('C:\\a.json', { createdFile: true })], 'b');
    const merged = mergeShellFixEntries(
      existing,
      [
        entry('C:\\a.json', {
          createdFile: false,
          fields: [{ key: 'defaultShell', previous: null }],
        }),
      ],
      'b',
    );
    assert.equal(merged.entries[0].createdFile, true);
    assert.deepEqual(
      merged.entries[0].fields.map((field) => field.key),
      ['env.CLAUDE_CODE_GIT_BASH_PATH', 'defaultShell'],
    );
  });
});
