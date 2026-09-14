/**
 * Agent Installation Detection
 * Determines which of the four v1 agents are installed, based on their CLI
 * binaries being resolvable on the machine (PATH lookup), which is what the
 * interactive wizard's pre-checked defaults depend on.
 */

import * as child_process from 'child_process';
import { AGENT_KEYS } from '../config/schema.js';
import type { AgentKey } from '../config/schema.js';

// The binary(ies) that indicate an agent is installed. An agent counts as
// present when at least one listed command resolves. Copilot rides on `gh`.
export const AGENT_COMMANDS: Record<AgentKey, string[]> = {
  claude_code: ['claude'],
  codex_cli: ['codex'],
  copilot: ['gh'],
  opencode: ['opencode'],
};

export type DetectFn = (command: string) => boolean;

const defaultDetect: DetectFn = (command) => {
  try {
    child_process.execSync(`${command} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Return the list of installed agent ids (e.g. ['claude_code', 'codex_cli']).
 */
export function detectInstalledAgents(detect: DetectFn = defaultDetect): AgentKey[] {
  const found: AgentKey[] = [];
  for (const agent of AGENT_KEYS) {
    if (isAgentInstalled(agent, detect)) {
      found.push(agent);
    }
  }
  return found;
}

/**
 * Check whether a single agent's CLI binary is resolvable.
 */
export function isAgentInstalled(agent: AgentKey, detect: DetectFn = defaultDetect): boolean {
  return AGENT_COMMANDS[agent].some(detect);
}
