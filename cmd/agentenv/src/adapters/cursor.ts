/**
 * Cursor Adapter — delegates to `rtk init -g --agent cursor`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';
import { claudeConfigDir, homeDir } from './agent-dirs.js';

export class CursorAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    super(config, {
      agentKey: 'cursor',
      label: 'Cursor',
      rtkFlags: RTK_INIT_FLAGS.cursor,
      configDir: path.join(homeDir(), '.cursor'),
      expectedFile: 'RTK.md',
      // Cursor's global rtk delegation shares Claude Code's RTK.md anchor
      // (honors CLAUDE_CONFIG_DIR, same as adapters/claude.ts); on Windows
      // rtk fails outright (rather than creating the dir) if it isn't
      // already there — see docs/research/rtk-init-behavior.md.
      extraGlobalDirs: [claudeConfigDir()],
    });
  }
}
