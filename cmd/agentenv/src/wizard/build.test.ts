import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_OPTIONS,
  buildConfigFromSelections,
  buildDefaultSimpleConfig,
  formatDiffLines,
  parseAgentsInput,
  simpleToolSelection,
} from './build.js';
import type { ConfigDiffEntry } from '../config/schema.js';

describe('wizard build helpers', () => {
  it('simpleToolSelection includes Tier 2 only when requested', () => {
    assert.deepEqual(simpleToolSelection(false), ['ripgrep', 'fd', 'jq', 'rtk']);
    assert.deepEqual(simpleToolSelection(true), [
      'ripgrep',
      'fd',
      'jq',
      'rtk',
      'ast_grep',
      'git_delta',
      'gh',
      'difftastic',
    ]);
  });

  it('buildConfigFromSelections toggles agents and tools', () => {
    const config = buildConfigFromSelections({
      agents: ['claude_code', 'opencode'],
      tools: ['ripgrep', 'fd'],
      customTools: [],
      scope: 'project',
      rtkEnabled: false,
    });

    assert.equal(config.agents?.claude_code, true);
    assert.equal(config.agents?.opencode, true);
    assert.equal(config.agents?.codex_cli, false);
    assert.equal(config.agents?.copilot, false);

    assert.equal(config.tools?.ripgrep, true);
    assert.equal(config.tools?.fd, true);
    assert.equal(config.tools?.jq, false);

    assert.equal(config.scope, 'project');
    assert.equal(config.rtk?.enabled, false);
    assert.equal(config.custom_tools, undefined);
    assert.deepEqual(config.generate?.files, ['AGENTS.md', 'CLAUDE.md']);
  });

  it('buildConfigFromSelections keeps custom tools and rtk init flags', () => {
    const config = buildConfigFromSelections({
      agents: ['codex_cli'],
      tools: ['rtk'],
      customTools: [{ name: 'my-tool', description: 'x', already_installed: true }],
      scope: 'user',
      rtkEnabled: true,
    });

    assert.equal(config.scope, 'user');
    assert.equal(config.custom_tools?.length, 1);
    assert.equal(config.custom_tools?.[0].name, 'my-tool');
    assert.equal(config.rtk?.init?.claude_code, true);
    assert.equal(config.rtk?.enabled, true);
    assert.equal(config.tools?.fzf, false);
  });

  it('formatDiffLines renders added/removed/changed entries', () => {
    const diff: ConfigDiffEntry[] = [
      { kind: 'added', key: 'agents.opencode', newValue: true },
      { kind: 'removed', key: 'tools.tokei', newValue: false },
      { kind: 'changed', key: 'scope', oldValue: 'project', newValue: 'user' },
      { kind: 'changed', key: 'rtk.enabled', oldValue: true, newValue: false },
    ];

    const lines = formatDiffLines(diff);
    assert.deepEqual(lines, [
      'add     agents.opencode',
      'remove  tools.tokei',
      'change  scope: project -> user',
      'change  rtk.enabled: true -> false',
    ]);
  });

  it('parseAgentsInput accepts valid agent keys and rejects unknown ones', () => {
    assert.deepEqual(parseAgentsInput('claude_code, opencode'), ['claude_code', 'opencode']);
    assert.deepEqual(parseAgentsInput('codex_cli,copilot,claude_code,opencode'), [
      'codex_cli',
      'copilot',
      'claude_code',
      'opencode',
    ]);
    assert.throws(() => parseAgentsInput('claude_code,bogus-agent'), /Unknown agent/);
  });

  it('buildDefaultSimpleConfig assembles unattended defaults', () => {
    const withTier2 = buildDefaultSimpleConfig(['claude_code', 'opencode'], true, true, 'project');
    assert.equal(withTier2.agents?.claude_code, true);
    assert.equal(withTier2.agents?.copilot, false);
    assert.equal(withTier2.tools?.difftastic, true);
    assert.equal(withTier2.rtk?.enabled, true);
    assert.equal(withTier2.scope, 'project');

    const noTier2 = buildDefaultSimpleConfig(['codex_cli'], false, false, 'user');
    assert.equal(noTier2.tools?.difftastic, false);
    assert.equal(noTier2.tools?.rtk, true);
    assert.equal(noTier2.rtk?.enabled, false);
    assert.equal(noTier2.scope, 'user');
  });

  it('passes through an integrations selection unchanged', () => {
    const integrations = { superpowers: { enabled: true, ref: 'v6.3.0' as const } };
    const config = buildConfigFromSelections({
      agents: ['claude_code'],
      tools: [],
      customTools: [],
      scope: 'project',
      rtkEnabled: true,
      integrations,
    });

    assert.deepEqual(config.integrations, integrations);
  });

  it('omits integrations from the built config when none is passed', () => {
    const config = buildConfigFromSelections({
      agents: ['claude_code'],
      tools: [],
      customTools: [],
      scope: 'project',
      rtkEnabled: true,
    });

    assert.equal(config.integrations, undefined);
  });

  it('AGENT_OPTIONS lists all nine agents', () => {
    assert.equal(AGENT_OPTIONS.length, 9);
    const keys = AGENT_OPTIONS.map((o) => o.value);
    assert.deepEqual([...keys].sort(), [
      'claude_code',
      'cline',
      'codex_cli',
      'copilot',
      'cursor',
      'gemini_cli',
      'opencode',
      'vibe',
      'windsurf',
    ]);
  });

  it('parseAgentsInput accepts the new agent keys', () => {
    const result = parseAgentsInput('gemini_cli, vibe');
    assert.deepEqual(result, ['gemini_cli', 'vibe']);
  });
});
