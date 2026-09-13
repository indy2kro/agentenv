/**
 * Codex CLI Adapter
 * Handles Codex CLI-specific configuration and hook setup
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';

export class CodexCliAdapter extends BaseAdapter {
  private configDir: string;

  constructor(config: AdapterConfig) {
    super(config);
    const home = process.env.HOME || process.env.USERPROFILE || '';
    this.configDir = path.join(home, '.codex');
  }

  getName(): string {
    return 'Codex CLI';
  }

  getConfigDir(): string {
    return this.configDir;
  }

  isInstalled(): boolean {
    try {
      // Check for Codex config directory
      if (fs.existsSync(this.configDir)) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
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
      result.errors.push(`Failed to create config directory: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Initialize config.toml with hooks enabled
    const configPath = path.join(this.configDir, 'config.toml');
    try {
      if (!fs.existsSync(configPath)) {
        const configContent = this.generateConfigToml();
        fs.writeFileSync(configPath, configContent);
        result.filesCreated.push(configPath);
      }
    } catch (err) {
      result.errors.push(`Failed to create config.toml: ${err instanceof Error ? err.message : String(err)}`);
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

    const configPath = path.join(this.configDir, 'config.toml');
    const hooksPath = path.join(this.configDir, 'hooks.json');
    
    // Codex CLI uses hooks.json for hook configuration
    // RTK provides built-in support for Codex CLI
    const rtkHooks = {
      SessionStart: [
        {
          command: 'rtk',
          args: ['hook', 'codex'],
        },
      ],
      PreToolUse: [
        {
          command: 'rtk',
          args: ['rewrite', '--tool', '{tool_name}'],
        },
      ],
    };

    try {
      // Ensure hooks are enabled in config.toml
      let configContent = this.generateConfigToml();
      
      if (fs.existsSync(configPath)) {
        const existing = fs.readFileSync(configPath, 'utf-8');
        if (!existing.includes('[features]') || !existing.includes('hooks = true')) {
          configContent = this.ensureHooksEnabled(existing);
        }
      }
      
      fs.writeFileSync(configPath, configContent);
      result.filesModified.push(configPath);
      
      // Create hooks.json with RTK hooks
      const hooksContent = JSON.stringify(rtkHooks, null, 2);
      fs.writeFileSync(hooksPath, hooksContent);
      result.filesCreated.push(hooksPath);
      result.message = `Configured Codex CLI hooks at ${hooksPath}`;
    } catch (err) {
      result.success = false;
      result.errors.push(`Failed to configure Codex CLI hooks: ${err instanceof Error ? err.message : String(err)}`);
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

    const hooksPath = path.join(this.configDir, 'hooks.json');
    
    try {
      if (fs.existsSync(hooksPath)) {
        fs.unlinkSync(hooksPath);
        result.filesModified.push(hooksPath);
      }
    } catch (err) {
      result.success = false;
      result.errors.push(`Failed to cleanup Codex CLI: ${err instanceof Error ? err.message : String(err)}`);
    }

    result.message = 'Codex CLI adapter cleaned up';
    return result;
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

  /**
   * Ensure hooks are enabled in existing config
   */
  private ensureHooksEnabled(existing: string): string {
    let hasFeatures = false;
    let hasHooks = false;
    
    const lines = existing.split('\n');
    const newLines: string[] = [];
    
    for (const line of lines) {
      newLines.push(line);
      
      if (line.includes('[features]')) {
        hasFeatures = true;
      }
      if (line.includes('hooks')) {
        hasHooks = true;
      }
    }
    
    if (!hasFeatures) {
      newLines.unshift('[features]');
      newLines.unshift('hooks = true');
      newLines.unshift('');
    } else if (!hasHooks) {
      // Add hooks line after [features]
      for (let i = 0; i < newLines.length; i++) {
        if (newLines[i].includes('[features]')) {
          newLines.splice(i + 1, 0, 'hooks = true');
          break;
        }
      }
    }
    
    return newLines.join('\n');
  }
}
