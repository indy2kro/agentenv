/**
 * Codex CLI Adapter
 * Handles Codex CLI-specific configuration and hook setup.
 * Hook wiring delegates to `rtk init --codex` (verified against rtk 0.42.4),
 * which writes RTK.md + AGENTS.md instead of a hand-rolled hooks.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { isAgentInstalled } from './detect.js';
import { RTK_INIT_FLAGS, resolveRtkInit, rtkMessage } from '../toolchain/rtk.js';
import { writeFileWithRetry } from '../utils/fs-retry.js';
import { codexConfigDir } from './agent-dirs.js';

export class CodexCliAdapter extends BaseAdapter {
  private configDir: string;

  constructor(config: AdapterConfig) {
    super(config);
    this.configDir = codexConfigDir();
  }

  getName(): string {
    return 'Codex CLI';
  }

  getConfigDir(): string {
    return this.configDir;
  }

  isInstalled(): boolean {
    return isAgentInstalled('codex_cli');
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
      result.message = 'Codex CLI adapter not enabled';
      return result;
    }

    // Create config directory if it doesn't exist
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        result.filesCreated.push(this.configDir);
      }
    } catch (err) {
      result.success = false;
      result.errors.push(
        `Failed to create config directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Create config.toml when missing (baseline; never clobber user content)
    const configPath = path.join(this.configDir, 'config.toml');
    try {
      if (!fs.existsSync(configPath)) {
        writeFileWithRetry(configPath, this.generateConfigToml());
        result.filesCreated.push(configPath);
      }
    } catch (err) {
      result.success = false;
      result.errors.push(
        `Failed to create config.toml: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Configure hooks if RTK is enabled
    if (this.config.rtkEnabled) {
      const hookResult = await this.configureHooks();
      if (hookResult.success) {
        result.filesCreated.push(...hookResult.filesCreated);
        result.filesModified.push(...hookResult.filesModified);
      } else {
        result.success = false;
        result.errors.push(...hookResult.errors);
      }
    }

    result.message = 'Codex CLI adapter initialized';
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
      result.message = 'Codex CLI adapter not enabled';
      return result;
    }

    // rtk init --codex writes RTK.md and patches AGENTS.md in the project dir.
    const flags = RTK_INIT_FLAGS.codex_cli;
    const rtkMdPath = path.join(this.config.baseDir, 'RTK.md');
    const existed = fs.existsSync(rtkMdPath);

    const run = resolveRtkInit(this.config.rtkInit)(flags, this.config.baseDir);
    if (run.success) {
      if (!existed && fs.existsSync(rtkMdPath)) result.filesCreated.push(rtkMdPath);
      result.message = rtkMessage(run);
    } else {
      result.success = false;
      result.errors.push(run.message + (run.stderr ? `: ${run.stderr.trim()}` : ''));
    }

    return result;
  }

  async cleanup(): Promise<AdapterResult> {
    // RTK.md/AGENTS.md are owned by rtk; nothing to remove on our side.
    return {
      success: true,
      message: 'Codex CLI adapter cleaned up',
      filesCreated: [],
      filesModified: [],
      errors: [],
    };
  }

  getEnvVars(): Record<string, string> {
    const env: Record<string, string> = {};

    // Codex CLI respects SHELL environment variable
    if (process.platform === 'win32' && this.config.rtkEnabled) {
      env.SHELL = 'bash.exe';
    }

    return env;
  }

  /**
   * Generate config.toml with hooks enabled
   */
  private generateConfigToml(): string {
    return `[features]
hooks = true

[tools]
# Tools will be provided by rtk and mise
`;
  }
}
