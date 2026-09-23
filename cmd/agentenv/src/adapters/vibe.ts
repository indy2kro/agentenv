/**
 * Mistral Vibe Adapter — delegates to `rtk init -g --agent vibe`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';
import { homeDir } from './agent-dirs.js';

export class VibeAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    super(config, {
      agentKey: 'vibe',
      label: 'Mistral Vibe',
      rtkFlags: RTK_INIT_FLAGS.vibe,
      configDir: path.join(homeDir(), '.vibe'),
      expectedFile: 'RTK.md',
    });
  }
}
