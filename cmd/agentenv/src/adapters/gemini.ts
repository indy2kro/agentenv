/**
 * Gemini CLI Adapter — delegates to `rtk init -g --gemini`.
 */

import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { AdapterConfig } from './base.js';
import { RTK_INIT_FLAGS } from '../toolchain/rtk.js';

export class GeminiCliAdapter extends RtkDelegationAdapter {
  constructor(config: AdapterConfig) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    super(config, {
      agentKey: 'gemini_cli',
      label: 'Gemini CLI',
      rtkFlags: RTK_INIT_FLAGS.gemini_cli,
      configDir: path.join(home, '.gemini'),
      expectedFile: 'RTK.md',
    });
  }
}
