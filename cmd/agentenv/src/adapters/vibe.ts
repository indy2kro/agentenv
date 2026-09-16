/**
 * Mistral Vibe Adapter — delegates to `rtk init --agent vibe`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';

export class VibeAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    super(config, {
      agentKey: 'vibe',
      label: 'Mistral Vibe',
      rtkFlags: RTK_INIT_FLAGS.vibe,
      configDir: path.join(home, '.vibe'),
      expectedFile: 'RTK.md',
    });
  }
}
