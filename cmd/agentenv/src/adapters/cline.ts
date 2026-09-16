/**
 * Cline CLI Adapter — delegates to `rtk init --agent cline`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';

export class ClineAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    super(config, {
      agentKey: 'cline',
      label: 'Cline CLI',
      rtkFlags: RTK_INIT_FLAGS.cline,
      configDir: path.join(home, '.cline'),
      expectedFile: 'RTK.md',
    });
  }
}
