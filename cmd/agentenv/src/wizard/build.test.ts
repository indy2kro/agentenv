import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_OPTIONS,
  buildConfigFromSelections,
  buildDefaultSimpleConfig,
  defaultToolSelection,
  formatDiffLines,
  parseAgentsInput,
  simpleToolSelection,
  TIER_LABELS,
  toolChoices,
} from './build.js';
import type { ToolChoiceEntry } from './build.js';
import {
  BINARY_MAP,
  DEFAULT_CONFIG,
  TOOL_DESCRIPTIONS,
  TOOL_KEYS,
  TOOL_TIERS,
} from '../config/schema.js';
import type { ConfigDiffEntry } from '../config/schema.js';

type ChoiceEntry = Extract<ToolChoiceEntry, { value: string }>;
type SeparatorEntry = Extract<ToolChoiceEntry, { line: string }>;
const choicesOf = (entries: ToolChoiceEntry[]): ChoiceEntry[] =>
  entries.filter((e) => e.type !== 'separator') as ChoiceEntry[];
const separatorsOf = (entries: ToolChoiceEntry[]): SeparatorEntry[] =>
  entries.filter((e) => e.type === 'separator') as SeparatorEntry[];

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

  it('defaultToolSelection returns Tier 1 + the four mise-installable Tier 2 tools, no Tier 3', () => {
    const sel = defaultToolSelection();
    assert.deepEqual(sel, [
      'ripgrep',
      'fd',
      'jq',
      'rtk',
      'ast_grep',
      'git_delta',
      'gh',
      'difftastic',
    ]);
    assert.equal(sel.includes('universal_ctags'), false);
    assert.equal(
      sel.some((key) => TOOL_TIERS[key] === 3),
      false,
    );
    assert.deepEqual(
      sel,
      TOOL_KEYS.filter((key) => sel.includes(key)),
    );
  });
});

describe('toolChoices', () => {
  it('orders all tools by tier with one separator between tiers', () => {
    const entries = toolChoices(DEFAULT_CONFIG);
    const separators = separatorsOf(entries);
    assert.equal(separators.length, 3);
    assert.match(separators[0].line, /Tier 1/);
    assert.match(separators[1].line, /Tier 2/);
    assert.match(separators[2].line, /Tier 3/);

    const values = choicesOf(entries).map((e) => e.value);
    assert.deepEqual(values, TOOL_KEYS);

    const labels = separators.map((e) => e.line);
    assert.deepEqual(labels, [
      `── Tier 1 · ${TIER_LABELS[1]} ──`,
      `── Tier 2 · ${TIER_LABELS[2]} ──`,
      `── Tier 3 · ${TIER_LABELS[3]} ──`,
    ]);
  });

  it('renders "binary — description [Tier N]" labels', () => {
    const entries = toolChoices(DEFAULT_CONFIG);
    const rg = choicesOf(entries).find((e) => e.value === 'ripgrep');
    assert.equal(rg?.name, 'rg — Fast text search (use instead of grep -r) [Tier 1]');
  });

  it('marks fallback tools with a manual-install note', () => {
    const entries = toolChoices(DEFAULT_CONFIG);
    const ctags = choicesOf(entries).find((e) => e.value === 'universal_ctags');
    assert.match(ctags?.name ?? '', /\[Tier 2 · fallback tool · requires manual install\]/);
  });

  it('pre-checks exactly the tools enabled in the supplied config', () => {
    const config = { ...DEFAULT_CONFIG, tools: { ...DEFAULT_CONFIG.tools, fzf: true } };
    const all = choicesOf(toolChoices(config));
    const fzf = all.find((e) => e.value === 'fzf');
    const rg = all.find((e) => e.value === 'ripgrep');
    const tokei = all.find((e) => e.value === 'tokei');
    assert.equal(fzf?.checked, true);
    assert.equal(rg?.checked, true);
    assert.equal(tokei?.checked, false);
  });
});

it('every catalog tool has a binary and description for the picker', () => {
  for (const key of TOOL_KEYS) {
    assert.ok(BINARY_MAP[key], `missing BINARY_MAP entry for ${key}`);
    assert.ok(TOOL_DESCRIPTIONS[key], `missing TOOL_DESCRIPTIONS entry for ${key}`);
  }
});
