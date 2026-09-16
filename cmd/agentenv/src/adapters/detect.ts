/**
 * Agent Installation Detection
 * Determines which of the nine agents are installed, based on their CLI
 * binaries being resolvable on the machine (PATH lookup), which is what the
 * interactive wizard's pre-checked defaults depend on.
 */

import * as fs from 'node:fs';
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
  gemini_cli: ['gemini'],
  cursor: ['cursor'],
  windsurf: ['windsurf'],
  cline: ['cline'],
  vibe: ['vibe'],
};

export type DetectFn = (command: string) => boolean;

const defaultDetect: DetectFn = (command) => {
  if (command.includes('/') || command.includes('\\') || command.includes(' ')) {
    return fs.existsSync(command);
  }
  // Detect by PATH resolution only — never execute the candidate. Executing
  // `--version` used to be the check, but GUI-capable launchers (notably
  // OpenCode's packaged desktop app) react to any invocation by opening the
  // full TUI, which `agentenv setup` must not do.
  return resolveBinary(command) !== null;
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

/**
 * Resolve the first PATH hit for a binary, or null when it is not on PATH.
 * Used by `agentenv status` to surface tool drift.
 */
export function resolveBinary(command: string): string | null {
  // Direct path inputs (including paths with spaces) should be checked locally
  // before using `where`/`which`; those lookup tools interpret a spaced path as a
  // glob/pattern instead of a literal path.
  if (command.includes('/') || command.includes('\\') || command.includes(' ')) {
    try {
      return fs.existsSync(command) ? command : null;
    } catch {
      return null;
    }
  }

  const look = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const result = child_process.spawnSync(look, [command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const out = result.stdout ?? '';
    return (
      out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? null
    );
  } catch {
    return null;
  }
}
