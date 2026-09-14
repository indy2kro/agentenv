import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { detectInstalledAgents, isAgentInstalled, resolveBinary } from './detect.js';
import type { DetectFn } from './detect.js';

function fakeDetect(present: string[]): DetectFn {
  return (command: string) => present.includes(command);
}

describe('agent installation detection', () => {
  it('reports no agents when nothing resolves', () => {
    assert.deepEqual(detectInstalledAgents(fakeDetect([])), []);
  });

  it('detects agents whose CLI binary resolves', () => {
    assert.deepEqual(detectInstalledAgents(fakeDetect(['claude', 'codex', 'opencode'])), [
      'claude_code',
      'codex_cli',
      'opencode',
    ]);
  });

  it('treats gh presence as Copilot presence', () => {
    assert.equal(isAgentInstalled('copilot', fakeDetect(['gh'])), true);
    assert.equal(isAgentInstalled('copilot', fakeDetect(['codex'])), false);
  });

  it('resolveBinary finds an existing binary and returns null otherwise', () => {
    assert.ok(resolveBinary('node') !== null);
    assert.equal(resolveBinary('definitely-not-a-real-agentenv-binary'), null);
  });

  it('resolveBinary handles a real binary path that contains spaces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-bin- '));
    const fileName = process.platform === 'win32' ? 'demo-tool.cmd' : 'demo-tool';
    const binary = path.join(dir, fileName);
    fs.writeFileSync(
      binary,
      process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\nexit 0\n',
    );
    if (process.platform !== 'win32') fs.chmodSync(binary, 0o755);

    assert.equal(resolveBinary(binary), binary);
  });
});
