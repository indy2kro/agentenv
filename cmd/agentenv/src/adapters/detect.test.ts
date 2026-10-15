import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AGENT_COMMANDS,
  detectInstalledAgents,
  isAgentInstalled,
  needsWindowsShell,
  pickLookupResult,
  resolveBinary,
} from './detect.js';
import { AGENT_KEYS } from '../config/schema.js';
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

  it('detects Copilot by its own CLI, not gh', () => {
    assert.equal(isAgentInstalled('copilot', fakeDetect(['copilot'])), true);
    assert.equal(isAgentInstalled('copilot', fakeDetect(['codex'])), false);
    assert.equal(isAgentInstalled('copilot', fakeDetect(['gh'])), false);
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

describe('agent catalog: detection', () => {
  it('AGENT_COMMANDS covers every agent key with a non-empty binary array', () => {
    for (const key of AGENT_KEYS) {
      const cmds = AGENT_COMMANDS[key];
      assert.ok(
        Array.isArray(cmds) && cmds.length > 0,
        `AGENT_COMMANDS missing or empty for ${key}`,
      );
    }
  });

  it('detects the five new agents by their CLI binaries', () => {
    assert.deepEqual(
      detectInstalledAgents(fakeDetect(['gemini', 'cursor', 'windsurf', 'cline', 'vibe'])),
      ['gemini_cli', 'cursor', 'windsurf', 'cline', 'vibe'],
    );
  });

  it('isAgentInstalled returns false for a missing binary', () => {
    assert.equal(isAgentInstalled('gemini_cli', fakeDetect([])), false);
  });
});

describe('Windows binary lookup', () => {
  it("prefers an executable extension over npm's extensionless shim", () => {
    const out = ['C:\\npm\\claude', 'C:\\npm\\claude.cmd', ''].join('\r\n');
    assert.equal(pickLookupResult(out, true), 'C:\\npm\\claude.cmd');
  });

  it('keeps the first line on other platforms and when nothing has an extension', () => {
    assert.equal(pickLookupResult('/usr/bin/a\n/opt/a\n', false), '/usr/bin/a');
    assert.equal(pickLookupResult('C:\\x\\tool\n', true), 'C:\\x\\tool');
    assert.equal(pickLookupResult('', true), null);
  });

  it('needs a shell only for .cmd/.bat on Windows', () => {
    assert.equal(needsWindowsShell('C:\\npm\\claude.cmd', 'win32'), true);
    assert.equal(needsWindowsShell('C:\\bin\\claude.exe', 'win32'), false);
    assert.equal(needsWindowsShell('/x/claude.cmd', 'linux'), false);
  });
});
