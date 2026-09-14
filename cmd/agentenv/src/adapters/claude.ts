/**
 * Claude Code Adapter
 * Handles Claude Code-specific configuration and hook setup
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';
import { isAgentInstalled } from './detect.js';

export class ClaudeCodeAdapter extends BaseAdapter {
  private configDir: string;

  constructor(config: AdapterConfig) {
    super(config);
    const home = process.env.HOME || process.env.USERPROFILE || '';
    this.configDir = path.join(home, '.claude');
  }

  getName(): string {
    return 'Claude Code';
  }

  getConfigDir(): string {
    return this.configDir;
  }

  isInstalled(): boolean {
    return isAgentInstalled('claude_code');
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
      result.message = 'Claude Code adapter not enabled';
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

    // Initialize settings.json with RTK hooks if enabled
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

    result.message = 'Claude Code adapter initialized';
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
      result.message = 'Claude Code adapter not enabled';
      return result;
    }

    const settingsPath = path.join(this.configDir, 'settings.json');

    // Claude Code stores hooks by event, then matcher. This matches the
    // structure written by `rtk init` and preserves existing hook entries.
    const rtkHook = {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'rtk hook claude' }],
    };

    try {
      let settings: any = {};

      // Load existing settings if they exist
      if (fs.existsSync(settingsPath)) {
        const content = fs.readFileSync(settingsPath, 'utf-8');
        try {
          settings = JSON.parse(content);
        } catch {
          // Invalid JSON, start fresh
          settings = {};
        }
      }

      if (!settings.hooks || Array.isArray(settings.hooks)) settings.hooks = {};
      if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];

      // Check if RTK hook already exists
      const hasRtkHook = settings.hooks.PreToolUse.some(
        (entry: any) =>
          entry.matcher === 'Bash' &&
          entry.hooks?.some((hook: any) => hook.command === 'rtk hook claude'),
      );

      if (!hasRtkHook) {
        settings.hooks.PreToolUse.push(rtkHook);
      }

      // Save settings
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      if (!hasRtkHook) {
        result.filesModified.push(settingsPath);
        result.message = `Added RTK PreToolUse hook to Claude Code settings at ${settingsPath}`;
      } else {
        result.message = `RTK hook already exists in Claude Code settings`;
      }
    } catch (err) {
      result.success = false;
      result.errors.push(
        `Failed to configure Claude Code hooks: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Also create CLAUDE.md pointing to AGENTS.md
    const claudeMdPath = path.join(this.config.baseDir, 'CLAUDE.md');
    try {
      const claudeMdContent = this.generateClaudeMdContent();

      if (!fs.existsSync(claudeMdPath)) {
        fs.writeFileSync(claudeMdPath, claudeMdContent);
        result.filesCreated.push(claudeMdPath);
      }
    } catch (err) {
      result.errors.push(
        `Failed to create CLAUDE.md: ${err instanceof Error ? err.message : String(err)}`,
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

    const settingsPath = path.join(this.configDir, 'settings.json');

    try {
      if (fs.existsSync(settingsPath)) {
        let settings: any = {};
        const content = fs.readFileSync(settingsPath, 'utf-8');
        try {
          settings = JSON.parse(content);
        } catch {
          return result;
        }

        // Remove RTK hooks
        if (Array.isArray(settings.hooks?.PreToolUse)) {
          settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
            (entry: any) =>
              !(
                entry.matcher === 'Bash' &&
                entry.hooks?.some((hook: any) => hook.command === 'rtk hook claude')
              ),
          );

          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
          result.filesModified.push(settingsPath);
        }
      }
    } catch (err) {
      result.success = false;
      result.errors.push(
        `Failed to cleanup Claude Code: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    result.message = 'Claude Code adapter cleaned up';
    return result;
  }

  getEnvVars(): Record<string, string> {
    const env: Record<string, string> = {};

    // Set SHELL to bash.exe on Windows if RTK is enabled
    if (process.platform === 'win32' && this.config.rtkEnabled) {
      env.SHELL = 'bash.exe';
    }

    return env;
  }

  /**
   * Generate CLAUDE.md content
   */
  private generateClaudeMdContent(): string {
    return `# CLAUDE.md

This file provides Claude Code-specific instructions.

## General Instructions

Please see [AGENTS.md](./AGENTS.md) for the complete list of AI agent instructions.

The instructions in AGENTS.md apply to Claude Code as well.

## Claude Code Specific Notes

- AGENTS.md is the source of truth for tool availability and usage instructions
- All tools listed in AGENTS.md are available for use
- RTK hooks are configured to optimize command execution
- Use RTK-optimized commands for better performance and token efficiency
`;
  }
}
