import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, type AgentenvConfig } from '../config/schema.js';
import { applyConfigEdit, classifyConfigKey, planConfigEdit } from './config-edit.js';

describe('classifyConfigKey', () => {
  it('classifies agent keys', () => {
    assert.equal(classifyConfigKey('claude_code'), 'agent');
    assert.equal(classifyConfigKey('vibe'), 'agent');
  });

  it('classifies tool keys', () => {
    assert.equal(classifyConfigKey('ripgrep'), 'tool');
    assert.equal(classifyConfigKey('trivy'), 'tool');
  });

  it('returns undefined for an unknown key', () => {
    assert.equal(classifyConfigKey('not-a-real-key'), undefined);
  });
});

describe('planConfigEdit', () => {
  it('plans enabling a currently-disabled tool and agent', () => {
    const config: AgentenvConfig = { ...DEFAULT_CONFIG, tools: { ripgrep: false } };
    const plan = planConfigEdit(config, ['ripgrep', 'copilot'], true);
    assert.deepEqual(plan.unknown, []);
    assert.deepEqual(plan.changes, [
      { kind: 'tool', key: 'ripgrep', from: false, to: true },
      { kind: 'agent', key: 'copilot', from: false, to: true },
    ]);
  });

  it('produces no change for an item already at the target value', () => {
    const config: AgentenvConfig = { ...DEFAULT_CONFIG, tools: { ripgrep: true } };
    const plan = planConfigEdit(config, ['ripgrep'], true);
    assert.deepEqual(plan.changes, []);
    assert.deepEqual(plan.unknown, []);
  });

  it('collects unknown keys instead of throwing', () => {
    const plan = planConfigEdit(DEFAULT_CONFIG, ['ripgrep', 'not-a-key'], true);
    assert.deepEqual(plan.unknown, ['not-a-key']);
    assert.equal(plan.changes.length, 0); // ripgrep already true in DEFAULT_CONFIG
  });

  it('dedupes repeated items', () => {
    const config: AgentenvConfig = { ...DEFAULT_CONFIG, tools: { ripgrep: false } };
    const plan = planConfigEdit(config, ['ripgrep', 'ripgrep'], true);
    assert.equal(plan.changes.length, 1);
  });

  it('plans disabling (enable=false)', () => {
    const config: AgentenvConfig = { ...DEFAULT_CONFIG, tools: { ripgrep: true } };
    const plan = planConfigEdit(config, ['ripgrep'], false);
    assert.deepEqual(plan.changes, [{ kind: 'tool', key: 'ripgrep', from: true, to: false }]);
  });
});

describe('applyConfigEdit', () => {
  it('flips the planned keys on a copy, never mutating the input config', () => {
    const config: AgentenvConfig = { ...DEFAULT_CONFIG, tools: { ripgrep: false } };
    const plan = planConfigEdit(config, ['ripgrep', 'copilot'], true);

    const next = applyConfigEdit(config, plan);

    assert.equal(next.tools?.ripgrep, true);
    assert.equal(next.agents?.copilot, true);
    // Original untouched.
    assert.equal(config.tools?.ripgrep, false);
    assert.equal(config.agents?.copilot, false);
  });

  it('leaves every other setting untouched', () => {
    const config: AgentenvConfig = {
      ...DEFAULT_CONFIG,
      tools: { ripgrep: false, fd: true },
      agents: { claude_code: true },
    };
    const plan = planConfigEdit(config, ['ripgrep'], true);

    const next = applyConfigEdit(config, plan);

    assert.equal(next.tools?.fd, true);
    assert.equal(next.agents?.claude_code, true);
  });
});
