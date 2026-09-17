/**
 * Wizard helpers: pure config assembly + diff presentation.
 * Kept free of inquirer/CLI so the logic is unit-testable.
 */

import { AGENT_KEYS, DEFAULT_CONFIG, TOOL_KEYS, TOOL_TIERS } from '../config/schema.js';
import type {
  AgentKey,
  AgentenvConfig,
  ConfigDiffEntry,
  CustomTool,
  IntegrationsConfig,
} from '../config/schema.js';

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
