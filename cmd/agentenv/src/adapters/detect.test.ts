import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectInstalledAgents, isAgentInstalled } from './detect.js';
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
});
