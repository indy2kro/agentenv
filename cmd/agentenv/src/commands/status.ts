import { Command } from 'commander';
import { readFileSync } from 'fs';
import toml from 'toml';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AgentenvConfig } from '../config/schema.js';

/**
 * Status command - Show what's installed, configured, and out of sync
 */

export const statusCommand = new Command()
  .name('status')
  .description('Show current configuration and environment status')
  .action(async () => {
    console.log('\n=== agentenv status ===\n');

    // Load config
    let configPath = 'agentenv.toml';
    let config: AgentenvConfig = {};
    let configLoaded = false;

    try {
      const data = readFileSync(configPath, 'utf-8');
      config = toml.parse(data);
      configLoaded = true;
      console.log(`Config: ${configPath}`);
    } catch {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const userConfigPath = path.join(home, '.config', 'agentenv', 'agentenv.toml');
      try {
        const data = readFileSync(userConfigPath, 'utf-8');
        config = toml.parse(data);
        configPath = userConfigPath;
        configLoaded = true;
        console.log(`Config: ${configPath}`);
      } catch {
        console.log('No agentenv.toml found');
      }
    }

    if (configLoaded) {
      console.log(`Scope: ${config.scope || 'project'}`);

      // Show agents
      console.log('\nEnabled Agents:');
      const agents = config.agents || {};
      if (agents.claude_code) console.log('  - Claude Code');
      if (agents.codex_cli) console.log('  - Codex CLI');
      if (agents.copilot) console.log('  - GitHub Copilot');
      if (agents.opencode) console.log('  - OpenCode');

      // Show tools
      console.log('\nEnabled Tools:');
      const tools = config.tools || {};
      const toolList = [];
      for (const [tool, enabled] of Object.entries(tools)) {
        if (enabled) toolList.push(tool);
      }
      if (toolList.length > 0) {
        toolList.forEach((t) => console.log(`  - ${t}`));
      } else {
        console.log('  (none)');
      }

      // Show rtk status
      console.log('\nRTK Status:');
      if (config.rtk?.enabled) {
        console.log('  Enabled: yes');
        console.log('  Init hooks:');
        const init = config.rtk?.init || {};
        if (init.claude_code) console.log('    - Claude Code');
        if (init.codex_cli) console.log('    - Codex CLI');
        if (init.copilot) console.log('    - GitHub Copilot');
        if (init.opencode) console.log('    - OpenCode');
      } else {
        console.log('  Enabled: no');
      }

      // Show Tier 0 status
      console.log('\nTier 0 (Shell):');
      if (config.tier0?.check_enabled !== false) {
        console.log('  Check enabled: yes');
      } else {
        console.log('  Check enabled: no');
      }
    }

    // Check for generated files
    console.log('\nGenerated Files:');
    const filesToCheck = [
      'mise.toml',
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/settings.json',
      '.claude/CLAUDE.md',
      '.codex/config.toml',
      '.codex/hooks.json',
    ];

    for (const file of filesToCheck) {
      try {
        await fs.access(file);
        console.log(`  ✓ ${file}`);
      } catch {
        console.log(`  ✗ ${file} (missing)`);
      }
    }

    // Check tool availability
    console.log('\nTool Availability:');
    const toolsToCheck = [
      { name: 'rg/ripgrep', command: 'rg --version' },
      { name: 'fd', command: 'fd --version' },
      { name: 'jq', command: 'jq --version' },
      { name: 'rtk', command: 'rtk --version' },
      { name: 'gh', command: 'gh --version' },
    ];

    for (const { name } of toolsToCheck) {
      try {
        // We can't actually run these without child_process, so just check
        console.log(`  ⚠ ${name} (not verified)`);
      } catch {
        console.log(`  ✗ ${name} (not found)`);
      }
    }

    console.log('\n=== Status Complete ===\n');
  });
