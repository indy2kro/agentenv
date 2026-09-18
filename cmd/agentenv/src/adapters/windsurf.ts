/**
 * Windsurf Adapter — delegates to `rtk init -g --agent windsurf`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';

export class WindsurfAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    super(config, {
      agentKey: 'windsurf',
      label: 'Windsurf',
      rtkFlags: RTK_INIT_FLAGS.windsurf,
      configDir: path.join(home, '.windsurf'),
      expectedFile: 'RTK.md',
    });
  }
}
