/**
 * GitHub Copilot Adapter
 * Handles GitHub Copilot-specific configuration and hook setup.
 * Hook wiring delegates to `rtk init --copilot`, which (verified against rtk
 * 0.42.4) writes .github/copilot-instructions.md + .github/hooks/rtk-rewrite.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { isAgentInstalled } from './detect.js';
import { RTK_INIT_FLAGS, resolveRtkInit, rtkMessage } from '../toolchain/rtk.js';

export class CopilotAdapter extends BaseAdapter {
  private configDir: string;

  constructor(config: AdapterConfig) {
    super(config);
    const home = process.env.HOME || process.env.USERPROFILE || '';
    this.configDir = path.join(home, '.config', 'github-copilot');
  }

  getName(): string {
    return 'GitHub Copilot';
  }

  getConfigDir(): string {
    return this.configDir;
  }

  getUserInstructionFile(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, '.copilot', 'copilot-instructions.md');
  }

  isInstalled(): boolean {
    return isAgentInstalled('copilot');
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
      result.message = 'GitHub Copilot adapter not enabled';
      return result;
    }

    // Configure hooks if RTK is enabled (delegates to `rtk init --copilot`)
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
      result.message = 'RTK disabled; no Copilot hooks configured';
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
      result.message = 'GitHub Copilot adapter not enabled';
      return result;
    }

    const flags = RTK_INIT_FLAGS.copilot;
    const before = this.outputFilesPresent();

    const run = resolveRtkInit(this.config.rtkInit)(flags, this.config.baseDir);
    if (run.success) {
      if (this.outputFilesPresent() && !before) {
        result.filesCreated.push(...this.outputPaths());
      }
      result.message = rtkMessage(run);
    } else {
      result.success = false;
      result.errors.push(run.message + (run.stderr ? `: ${run.stderr.trim()}` : ''));
    }

    return result;
  }

  async cleanup(): Promise<AdapterResult> {
    // rtk owns the .github hook files; nothing to remove on our side.
    return {
      success: true,
      message: 'GitHub Copilot adapter cleaned up',
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

  private outputPaths(): string[] {
    return [
      path.join(this.config.baseDir, '.github', 'copilot-instructions.md'),
      path.join(this.config.baseDir, '.github', 'hooks', 'rtk-rewrite.json'),
    ];
  }

  private outputFilesPresent(): boolean {
    return this.outputPaths().some((f) => fs.existsSync(f));
  }
}
