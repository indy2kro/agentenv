/**
 * Windsurf Adapter — delegates to `rtk init -g --agent windsurf`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';
import { homeDir } from './agent-dirs.js';

export class WindsurfAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    super(config, {
      agentKey: 'windsurf',
      label: 'Windsurf',
      rtkFlags: RTK_INIT_FLAGS.windsurf,
      configDir: path.join(homeDir(), '.windsurf'),
      expectedFile: 'RTK.md',
    });
  }
}
