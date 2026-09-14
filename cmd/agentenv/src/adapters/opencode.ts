/**
 * OpenCode Adapter
 * Handles OpenCode-specific configuration and plugin setup.
 * Plugin wiring delegates to `rtk init -g --opencode` (global-only), which
 * (verified against rtk 0.42.4) writes ~/.config/opencode/plugins/rtk.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { isAgentInstalled } from './detect.js';
import { RTK_INIT_FLAGS, resolveRtkInit, rtkMessage } from '../toolchain/rtk.js';

export class OpenCodeAdapter extends BaseAdapter {
  private configDir: string;

  constructor(config: AdapterConfig) {
    super(config);
    const home = process.env.HOME || process.env.USERPROFILE || '';
    this.configDir = path.join(home, '.config', 'opencode');
  }

  getName(): string {
    return 'OpenCode';
  }

  getConfigDir(): string {
    return this.configDir;
  }

  isInstalled(): boolean {
    return isAgentInstalled('opencode');
  }

  async initialize(): Promise<AdapterResult> {
    const result: AdapterResult = {
      success: true,
      message: '',
      filesCreated: [],
      filesModified: [],
      errors: [],
    };

    if (!this.config.enabled) {
      result.message = 'OpenCode adapter not enabled';
      return result;
    }

    // Configure plugin if RTK is enabled (delegates to `rtk init -g --opencode`)
    if (this.config.rtkEnabled) {
      const hookResult = await this.configureHooks();
      if (hookResult.success) {
        result.filesCreated.push(...hookResult.filesCreated);
        result.filesModified.push(...hookResult.filesModified);
        result.message = hookResult.message;
      } else {
        result.success = false;
        result.errors.push(...hookResult.errors);
      }
    } else {
      result.message = 'RTK disabled; no OpenCode plugin configured';
    }

    return result;
  }

  async configureHooks(): Promise<AdapterResult> {
    const result: AdapterResult = {
      success: true,
      message: '',
      filesCreated: [],
      filesModified: [],
      errors: [],
    };

    if (!this.config.enabled) {
      result.message = 'OpenCode adapter not enabled';
      return result;
    }

    const flags = RTK_INIT_FLAGS.opencode;
    const pluginPath = path.join(this.configDir, 'plugins', 'rtk.ts');
    const existed = fs.existsSync(pluginPath);

    const run = resolveRtkInit(this.config.rtkInit)(flags, this.config.baseDir);
    if (run.success) {
      if (run.stdout.includes('already up to date')) {
        result.message = 'OpenCode rtk plugin already up to date';
      } else {
        if (!existed && fs.existsSync(pluginPath)) result.filesCreated.push(pluginPath);
        result.message = rtkMessage(run);
      }
    } else {
      result.success = false;
      result.errors.push(run.message + (run.stderr ? `: ${run.stderr.trim()}` : ''));
    }

    return result;
  }

  async cleanup(): Promise<AdapterResult> {
    // plugins/rtk.ts is owned by rtk; nothing to remove on our side.
    return {
      success: true,
      message: 'OpenCode adapter cleaned up',
      filesCreated: [],
      filesModified: [],
      errors: [],
    };
  }

  getEnvVars(): Record<string, string> {
    const env: Record<string, string> = {};

    if (process.platform === 'win32' && this.config.rtkEnabled) {
      env.SHELL = 'bash.exe';
    }

    return env;
  }
}
