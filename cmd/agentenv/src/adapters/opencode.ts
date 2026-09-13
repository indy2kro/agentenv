/**
 * OpenCode Adapter
 * Handles OpenCode-specific configuration and plugin setup
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAdapter, AdapterConfig, AdapterResult } from './base.js';

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
    try {
      // Check for OpenCode config directory
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
      result.message = 'OpenCode adapter not enabled';
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

    // Create opencode.json if it doesn't exist
    const configPath = path.join(this.configDir, 'opencode.json');
    try {
      if (!fs.existsSync(configPath)) {
        const configContent = this.generateDefaultConfig();
        fs.writeFileSync(configPath, configContent);
        result.filesCreated.push(configPath);
      }
    } catch (err) {
      result.errors.push(`Failed to create opencode.json: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Configure plugin if RTK is enabled
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

    result.message = 'OpenCode adapter initialized';
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

    // OpenCode uses plugins in ~/.config/opencode/plugins/
    const pluginsDir = path.join(this.configDir, 'plugins');
    
    // RTK plugin for OpenCode
    // OpenCode plugins are Node.js scripts
    const rtkPluginContent = `/**
 * RTK Plugin for OpenCode
 * This plugin integrates RTK with OpenCode for command optimization
 */

import { registerPlugin } from '@opencode/plugin-api';

registerPlugin({
  name: 'rtk-optimizer',
  description: 'RTK command optimizer for OpenCode',
  hooks: {
    onCommand: async (command, context) => {
      // Use RTK to optimize the command
      const rtk = require('child_process').execSync;
      try {
        const optimized = rtk(\`rtk rewrite \${command}\`);
        return optimized.toString().trim();
      } catch {
        return command; // Fallback to original command
      }
    },
    onToolUse: async (tool, args, context) => {
      // Notify RTK of tool use
      const rtk = require('child_process').execSync;
      try {
        rtk(\`rtk hook opencode \${tool} \${args.join(' ')}\`);
      } catch {
        // Ignore errors
      }
    },
  },
});
`;

    try {
      // Create plugins directory if it doesn't exist
      if (!fs.existsSync(pluginsDir)) {
        fs.mkdirSync(pluginsDir, { recursive: true });
        result.filesCreated.push(pluginsDir);
      }
      
      // Create RTK plugin file
      const pluginPath = path.join(pluginsDir, 'rtk-optimizer.js');
      
      if (!fs.existsSync(pluginPath)) {
        fs.writeFileSync(pluginPath, rtkPluginContent);
        result.filesCreated.push(pluginPath);
        result.message = `Created OpenCode RTK plugin at ${pluginPath}`;
      } else {
        // Check if it's already our plugin
        const existing = fs.readFileSync(pluginPath, 'utf-8');
        if (!existing.includes('rtk-optimizer')) {
          // Backup existing plugin
          const backupPath = `${pluginPath}.bak`;
          fs.writeFileSync(backupPath, existing);
          fs.writeFileSync(pluginPath, rtkPluginContent);
          result.filesModified.push(pluginPath);
          result.message = `Updated OpenCode RTK plugin at ${pluginPath}`;
        } else {
          result.message = `RTK plugin already configured for OpenCode`;
        }
      }
      
      // Ensure plugin is registered in opencode.json
      this.ensurePluginRegistered();
    } catch (err) {
      result.success = false;
      result.errors.push(`Failed to configure OpenCode plugin: ${err instanceof Error ? err.message : String(err)}`);
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

    const pluginsDir = path.join(this.configDir, 'plugins');
    const pluginPath = path.join(pluginsDir, 'rtk-optimizer.js');
    
    try {
      if (fs.existsSync(pluginPath)) {
        const content = fs.readFileSync(pluginPath, 'utf-8');
        if (content.includes('rtk-optimizer')) {
          // Restore backup if it exists
          const backupPath = `${pluginPath}.bak`;
          if (fs.existsSync(backupPath)) {
            fs.writeFileSync(pluginPath, fs.readFileSync(backupPath, 'utf-8'));
            fs.unlinkSync(backupPath);
          } else {
            fs.unlinkSync(pluginPath);
          }
          result.filesModified.push(pluginPath);
        }
      }
    } catch (err) {
      result.success = false;
      result.errors.push(`Failed to cleanup OpenCode: ${err instanceof Error ? err.message : String(err)}`);
    }

    result.message = 'OpenCode adapter cleaned up';
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
   * Generate default opencode.json config
   */
  private generateDefaultConfig(): string {
    return `{
  "plugins": [
    {
      "name": "rtk-optimizer",
      "enabled": true
    }
  ],
  "features": {
    "plugins": true
  }
}
`;
  }

  /**
   * Ensure RTK plugin is registered in opencode.json
   */
  private ensurePluginRegistered(): void {
    const configPath = path.join(this.configDir, 'opencode.json');
    
    try {
      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, this.generateDefaultConfig());
        return;
      }
      
      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      
      // Ensure plugins array exists
      if (!config.plugins) {
        config.plugins = [];
      }
      
      // Check if RTK plugin is already registered
      const hasRtkPlugin = config.plugins.some(
        (p: any) => p.name === 'rtk-optimizer' || p.name === 'rtk'
      );
      
      if (!hasRtkPlugin) {
        config.plugins.push({
          name: 'rtk-optimizer',
          enabled: true,
        });
        
        // Ensure plugins feature is enabled
        if (!config.features) {
          config.features = {};
        }
        if (config.features.plugins !== true) {
          config.features.plugins = true;
        }
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      }
    } catch {
      // Ignore errors
    }
  }
}
