/**
 * GitHub Copilot Adapter
 * Handles GitHub Copilot-specific configuration and hook setup
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { isAgentInstalled } from './detect.js';

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

    result.message = 'GitHub Copilot adapter initialized';
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

    // GitHub Copilot uses hooks in ~/.copilot/hooks/
    const hooksDir = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.copilot',
      'hooks',
    );
    const configPath = path.join(this.configDir, 'config.json');

    // RTK hook for Copilot
    // Copilot uses a different hook mechanism - scripts in ~/.copilot/hooks/
    const rtkHookContent = `#!/bin/bash
# RTK hook for GitHub Copilot
# This hook is called before each tool use

exec rtk hook copilot "$@"
`;

    try {
      // Create hooks directory if it doesn't exist
      if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true });
        result.filesCreated.push(hooksDir);
      }

      // Create pre-tool-use hook
      const hookPath = path.join(hooksDir, 'pre-tool-use');

      if (!fs.existsSync(hookPath)) {
        fs.writeFileSync(hookPath, rtkHookContent);
        // Make executable on Unix-like systems
        if (process.platform !== 'win32') {
          fs.chmodSync(hookPath, 0o755);
        }
        result.filesCreated.push(hookPath);
        result.message = `Created Copilot pre-tool-use hook at ${hookPath}`;
      } else {
        // Check if it's already our hook
        const existing = fs.readFileSync(hookPath, 'utf-8');
        if (!existing.includes('rtk hook copilot')) {
          // Backup existing hook
          const backupPath = `${hookPath}.bak`;
          fs.writeFileSync(backupPath, existing);
          fs.writeFileSync(hookPath, rtkHookContent);
          result.filesModified.push(hookPath);
          result.message = `Updated Copilot pre-tool-use hook at ${hookPath}`;
        } else {
          result.message = `RTK hook already configured for Copilot`;
        }
      }

      // Ensure hooks are enabled in config.json
      this.ensureHooksEnabled(configPath);
    } catch (err) {
      result.success = false;
      result.errors.push(
        `Failed to configure Copilot hooks: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return result;
  }

  async cleanup(): Promise<AdapterResult> {
    const result: AdapterResult = {
      success: true,
      message: '',
      filesCreated: [],
      filesModified: [],
      errors: [],
    };

    const hooksDir = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.copilot',
      'hooks',
    );
    const hookPath = path.join(hooksDir, 'pre-tool-use');

    try {
      if (fs.existsSync(hookPath)) {
        const content = fs.readFileSync(hookPath, 'utf-8');
        if (content.includes('rtk hook copilot')) {
          // Restore backup if it exists
          const backupPath = `${hookPath}.bak`;
          if (fs.existsSync(backupPath)) {
            fs.writeFileSync(hookPath, fs.readFileSync(backupPath, 'utf-8'));
            fs.unlinkSync(backupPath);
          } else {
            fs.unlinkSync(hookPath);
          }
          result.filesModified.push(hookPath);
        }
      }
    } catch (err) {
      result.success = false;
      result.errors.push(
        `Failed to cleanup Copilot: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    result.message = 'GitHub Copilot adapter cleaned up';
    return result;
  }

  getEnvVars(): Record<string, string> {
    const env: Record<string, string> = {};

    if (process.platform === 'win32' && this.config.rtkEnabled) {
      env.SHELL = 'bash.exe';
    }

    return env;
  }

  /**
   * Ensure hooks are enabled in Copilot config
   */
  private ensureHooksEnabled(configPath: string): void {
    try {
      if (!fs.existsSync(configPath)) {
        // Create default config with hooks enabled
        const config = {
          features: {
            hooks: true,
          },
        };
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      } else {
        // Check if hooks are enabled
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);

        if (!config.features) {
          config.features = {};
        }
        if (config.features.hooks !== true) {
          config.features.hooks = true;
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        }
      }
    } catch {
      // Ignore errors
    }
  }
}
