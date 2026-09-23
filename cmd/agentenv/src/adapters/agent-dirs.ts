/**
 * Shared home/config-dir resolution for agent adapters and `status`.
 *
 * Centralizes two things every adapter used to duplicate, inconsistently:
 *  - Falling back to Node's os.homedir() (a real OS lookup) instead of ''
 *    when HOME/USERPROFILE are both unset. path.join('', '.claude') is a
 *    *relative* '.claude', so an unset HOME silently wrote into
 *    process.cwd() instead of failing loudly or using a sane default.
 *  - Honoring each agent's own config-dir override
 *    (CLAUDE_CONFIG_DIR, CODEX_HOME, XDG_CONFIG_HOME for copilot/opencode)
 *    instead of assuming the default location — a user who relocated their
 *    agent config otherwise gets hooks written where the agent never reads
 *    them.
 *
 * status.ts's drift checks import these too, so "is this agent configured"
 * always looks in the same place the adapter actually wrote to.
 */

import * as os from 'os';
import * as path from 'path';

export function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

/** XDG_CONFIG_HOME when set to an absolute path, else <home>/.config. */
export function xdgConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && path.isAbsolute(xdg) ? xdg : path.join(homeDir(), '.config');
}

/** Claude Code's config dir: CLAUDE_CONFIG_DIR when absolute, else ~/.claude. */
export function claudeConfigDir(): string {
  const override = process.env.CLAUDE_CONFIG_DIR;
  return override && path.isAbsolute(override) ? override : path.join(homeDir(), '.claude');
}

/** Codex CLI's config dir: CODEX_HOME when absolute, else ~/.codex. */
export function codexConfigDir(): string {
  const override = process.env.CODEX_HOME;
  return override && path.isAbsolute(override) ? override : path.join(homeDir(), '.codex');
}

/** GitHub Copilot's config dir: <XDG_CONFIG_HOME>/github-copilot. */
export function copilotConfigDir(): string {
  return path.join(xdgConfigDir(), 'github-copilot');
}

/** OpenCode's config dir: <XDG_CONFIG_HOME>/opencode. */
export function opencodeConfigDir(): string {
  return path.join(xdgConfigDir(), 'opencode');
}
