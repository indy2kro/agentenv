import * as path from 'path';
import { claudeConfigDir, homeDir, opencodeConfigDir } from '../adapters/agent-dirs.js';
import type { AgentKey } from '../config/schema.js';

/**
 * Where each agent's rtk wiring lands, for `status` (is it configured?) and
 * `apply --dry-run` (which files will it touch?). Lives apart from both so
 * neither has to import the other.
 */
export const AGENT_CONFIG_FILES: Record<
  AgentKey,
  {
    label: string;
    check: (baseDir: string) => string;
    contains?: string;
    /** rtk wiring that only works in a project: apply skips it in user scope, so it is never drift there. */
    projectOnly?: boolean;
  }
> = {
  claude_code: {
    label: 'Claude Code',
    check: () => path.join(claudeConfigDir(), 'settings.json'),
    // settings.json usually exists already; only the rtk hook entry means wired.
    contains: 'rtk hook claude',
  },
  // Written by `rtk init --codex` in the project dir (project-scoped; not -g).
  codex_cli: {
    label: 'Codex CLI',
    check: (baseDir) => path.join(baseDir, 'RTK.md'),
    projectOnly: true,
  },
  copilot: {
    label: 'GitHub Copilot',
    // copilot-instructions.md may be the user's own; the rtk hook file is ours.
    check: (baseDir) => path.join(baseDir, '.github', 'hooks', 'rtk-rewrite.json'),
    projectOnly: true,
  },
  opencode: {
    label: 'OpenCode',
    check: () => path.join(opencodeConfigDir(), 'plugins', 'rtk.ts'),
  },
  // `-g --gemini` (verified live against a real rtk install): writes
  // GEMINI.md — not RTK.md — into Gemini's own global config dir.
  gemini_cli: { label: 'Gemini CLI', check: () => path.join(homeDir(), '.gemini', 'GEMINI.md') },
  // `-g --agent cursor` writes into the shared Claude Code anchor, not
  // Cursor's own config dir or baseDir — see adapters/cursor.ts's
  // extraGlobalDirs comment; confirmed live.
  cursor: { label: 'Cursor', check: () => path.join(claudeConfigDir(), 'RTK.md') },
  // Verified against rtk 0.49.0: `-g --agent windsurf` writes .windsurfrules into
  // the project dir (no RTK.md).
  windsurf: {
    label: 'Windsurf',
    check: (baseDir) => path.join(baseDir, '.windsurfrules'),
    projectOnly: true,
  },
  // `--agent cline` (project-scoped; not -g) writes RTK.md in baseDir.
  cline: {
    label: 'Cline CLI',
    check: (baseDir) => path.join(baseDir, 'RTK.md'),
    projectOnly: true,
  },
  // Verified against rtk 0.49.0: `-g --agent vibe` registers ~/.vibe/hooks.toml.
  vibe: {
    label: 'Mistral Vibe',
    check: () => path.join(homeDir(), '.vibe', 'hooks.toml'),
    contains: 'rtk',
  },
};
