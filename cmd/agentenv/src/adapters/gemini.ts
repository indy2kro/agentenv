/**
 * Gemini CLI Adapter — delegates to `rtk init -g --gemini`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';
import { homeDir } from './agent-dirs.js';

export class GeminiCliAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    super(config, {
      agentKey: 'gemini_cli',
      label: 'Gemini CLI',
      rtkFlags: RTK_INIT_FLAGS.gemini_cli,
      configDir: path.join(homeDir(), '.gemini'),
      expectedFile: 'RTK.md',
    });
  }
}
