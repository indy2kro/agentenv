/**
 * Cursor Adapter — delegates to `rtk init --agent cursor`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';

export class CursorAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    super(config, {
      agentKey: 'cursor',
      label: 'Cursor',
      rtkFlags: RTK_INIT_FLAGS.cursor,
      configDir: path.join(home, '.cursor'),
      expectedFile: 'RTK.md',
    });
  }
}
