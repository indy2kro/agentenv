/**
 * Wizard helpers: pure config assembly + diff presentation.
 * Kept free of inquirer/CLI so the logic is unit-testable.
 */

import {
  AGENT_KEYS,
  BINARY_MAP,
  DEFAULT_CONFIG,
  TOOL_DESCRIPTIONS,
  TOOL_KEYS,
  TOOL_TIERS,
} from '../config/schema.js';
import type {
  AgentKey,
  AgentenvConfig,
  ConfigDiffEntry,
  CustomTool,
  IntegrationsConfig,
} from '../config/schema.js';
import { requiresFallback } from '../toolchain/fallbacks.js';

export const AGENT_OPTIONS: Array<{ value: AgentKey; label: string }> = [
  { value: 'claude_code', label: 'Claude Code' },
  { value: 'codex_cli', label: 'Codex CLI' },
  { value: 'copilot', label: 'GitHub Copilot' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'gemini_cli', label: 'Gemini CLI' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'cline', label: 'Cline CLI' },
  { value: 'vibe', label: 'Mistral Vibe' },
];

export function defaultToolSelection(): string[] {
  return TOOL_KEYS.filter((key) => DEFAULT_CONFIG.tools?.[key] === true);
}

export function simpleToolSelection(includeTier2: boolean): string[] {
  const maxTier = includeTier2 ? 2 : 1;
  return defaultToolSelection().filter((key) => (TOOL_TIERS[key] ?? 0) <= maxTier);
}

export const TIER_LABELS: Record<number, string> = {
  1: 'Essential',
  2: 'AI-coding value-add',
  3: 'Power-user',
};

// Discriminated union: the value branch must carry `type?: never` so that
// (`e.type === 'separator'`) narrows correctly, and so the branch stays
// assignable to @inquirer's Choice type (which also declares `type?: never`).
export type ToolChoiceEntry =
  | { type: 'separator'; line: string }
  | { type?: never; value: string; name: string; checked: boolean };

export function toolChoices(existing: AgentenvConfig): ToolChoiceEntry[] {
  const entries: ToolChoiceEntry[] = [];
  for (const tier of [1, 2, 3]) {
    const keys = TOOL_KEYS.filter((key) => TOOL_TIERS[key] === tier);
    if (keys.length === 0) continue;
    entries.push({ type: 'separator', line: `── Tier ${tier} · ${TIER_LABELS[tier]} ──` });
    for (const key of keys) {
      const tierTag = requiresFallback(key)
        ? `[Tier ${tier} · fallback tool · requires manual install]`
        : `[Tier ${tier}]`;
      entries.push({
        value: key,
        name: `${BINARY_MAP[key]} — ${TOOL_DESCRIPTIONS[key]} ${tierTag}`,
        checked: existing.tools?.[key] === true,
      });
    }
  }
  return entries;
}

/**
 * Parse a comma-separated agent list (from `--agents`) into valid AgentKeys.
 * Rejects unknown names so a typo can't silently drop an agent.
 */
export function parseAgentsInput(input: string): AgentKey[] {
  const seen = new Set<AgentKey>();
  for (const raw of input.split(',')) {
    const name = raw.trim();
    if (!name) continue;
    const key = AGENT_KEYS.find((candidate) => candidate === name);
    if (!key) {
      throw new Error(`Unknown agent "${name}". Valid agents: ${AGENT_KEYS.join(', ')}`);
    }
    seen.add(key);
  }
  return [...seen];
}

/**
 * Unattended (non-interactive) setup with simple-mode defaults. Used by
 * `agentenv setup --yes` when no existing config file is available.
 */
export function buildDefaultSimpleConfig(
  agents: AgentKey[],
  includeTier2: boolean,
  rtkEnabled: boolean,
  scope: 'project' | 'user',
): AgentenvConfig {
  return buildConfigFromSelections({
    agents,
    tools: simpleToolSelection(includeTier2),
    customTools: [],
    scope,
    rtkEnabled,
  });
}

export interface WizardSelections {
  agents: AgentKey[];
  tools: string[];
  customTools: CustomTool[];
  scope: 'project' | 'user';
  rtkEnabled: boolean;
  integrations?: IntegrationsConfig;
}

/** Assemble a full AgentenvConfig from picker selections. */
export function buildConfigFromSelections(sel: WizardSelections): AgentenvConfig {
  const agents = Object.fromEntries(AGENT_KEYS.map((key) => [key, false])) as Record<
    AgentKey,
    boolean
  >;
  for (const agent of sel.agents) agents[agent] = true;

  const tools: NonNullable<AgentenvConfig['tools']> = {};
  for (const key of TOOL_KEYS) tools[key] = sel.tools.includes(key);

  return {
    scope: sel.scope,
    agents,
    tools,
    custom_tools: sel.customTools.length > 0 ? sel.customTools : undefined,
    integrations: sel.integrations,
    rtk: {
      enabled: sel.rtkEnabled,
      init: Object.fromEntries(AGENT_KEYS.map((key) => [key, true])),
    },
    tier0: { check_enabled: true },
    generate: {
      marker_start: '<!-- agentenv-managed-start -->',
      marker_end: '<!-- agentenv-managed-end -->',
      files: ['AGENTS.md', 'CLAUDE.md'],
    },
  };
}

/** Render a ConfigDiffEntry[] as human-readable review lines. */
export function formatDiffLines(diff: ConfigDiffEntry[]): string[] {
  return diff.map((entry) => {
    const action = entry.kind === 'added' ? 'add' : entry.kind === 'removed' ? 'remove' : 'change';
    const detail =
      entry.kind === 'changed'
        ? `: ${formatValue(entry.oldValue)} -> ${formatValue(entry.newValue)}`
        : '';
    return `${action.padEnd(7)} ${entry.key}${detail}`;
  });
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'unset';
  if (typeof value === 'boolean' || typeof value === 'string') return String(value);
  return JSON.stringify(value);
}
