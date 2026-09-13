import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { readFileSync } from 'fs';
import toml from 'toml';

/**
 * Apply command - Non-interactive: read config and generate everything
 * Steps:
 * 1. Read agentenv.toml
 * 2. Generate mise.toml
 * 3. Run mise install
 * 4. Generate AGENTS.md/CLAUDE.md marker blocks
 * 5. Generate per-agent hooks
 */

// AgentenvConfig interface matching the TOML schema
export interface AgentenvConfig {
  scope?: 'project' | 'user';
  agents?: {
    claude_code?: boolean;
    codex_cli?: boolean;
    copilot?: boolean;
    opencode?: boolean;
  };
  tools?: {
    ripgrep?: boolean;
    fd?: boolean;
    jq?: boolean;
    rtk?: boolean;
    ast_grep?: boolean;
    git_delta?: boolean;
    universal_ctags?: boolean;
    gh?: boolean;
    difftastic?: boolean;
    yq?: boolean;
    bat?: boolean;
    eza?: boolean;
    miller?: boolean;
    tokei?: boolean;
    hyperfine?: boolean;
    fzf?: boolean;
    just?: boolean;
    watchexec?: boolean;
    direnv?: boolean;
  };
  custom_tools?: Array<{
    name: string;
    description: string;
    already_installed?: boolean;
    path_windows?: string;
    path_macos?: string;
    path_linux?: string;
    mise_source?: string;
    version?: string;
  }>;
  rtk?: {
    enabled?: boolean;
    init?: {
      claude_code?: boolean;
      codex_cli?: boolean;
      copilot?: boolean;
      opencode?: boolean;
    };
  };
  tier0?: {
    check_enabled?: boolean;
    git_bash_path?: string;
  };
  generate?: {
    marker_start?: string;
    marker_end?: string;
    files?: string[];
  };
  advanced?: {
    default_mode?: string;
    show_diff_preview?: boolean;
  };
}

// Tool mappings for binary names
const BINARY_MAP: Record<string, string> = {
  'ripgrep': 'rg',
  'fd': 'fd',
  'jq': 'jq',
  'rtk': 'rtk',
  'ast-grep': 'sg',
  'delta': 'delta',
  'git-delta': 'delta',
  'gh': 'gh',
  'difftastic': 'difft',
  'yq': 'yq',
  'bat': 'bat',
  'eza': 'eza',
  'miller': 'mlr',
  'tokei': 'tokei',
  'hyperfine': 'hyperfine',
  'fzf': 'fzf',
  'just': 'just',
  'watchexec': 'watchexec',
  'direnv': 'direnv',
};

// Tool descriptions
const TOOL_DESCRIPTIONS: Record<string, string> = {
  'ripgrep': 'Fast text search (use instead of grep -r)',
  'fd': 'Fast, user-friendly file finder',
  'jq': 'Lightweight and flexible command-line JSON processor',
  'rtk': 'CLI proxy that reduces LLM token consumption by 60-90%',
  'ast-grep': 'Structural/AST-based code search and rewrite',
  'git-delta': 'Syntax-highlighted git diff pager',
  'difftastic': 'Structural diff tool that understands syntax',
  'gh': 'GitHub CLI for repository operations',
  'yq': 'YAML/TOML processor (jq for YAML)',
  'bat': 'cat clone with syntax highlighting and git integration',
  'eza': 'Modern replacement for ls',
  'miller': 'CSV/TSV data processing',
  'tokei': 'Fast code statistics (LOC, etc.)',
  'hyperfine': 'Command-line benchmarking tool',
  'fzf': 'Fuzzy finder with non-interactive filter mode',
  'just': 'Command runner for project recipes',
  'watchexec': 'File watcher that runs commands on changes',
  'direnv': 'Environment variable manager',
};

export const applyCommand = new Command()
  .name('apply')
  .description('Non-interactive: read config and generate everything')
  .action(async () => {
    console.log('\n=== agentenv apply ===\n');

    // Step 1: Find and load config file
    let configPath = 'agentenv.toml';
    let config: AgentenvConfig = {};

    try {
      const data = readFileSync(configPath, 'utf-8');
      config = toml.parse(data) as AgentenvConfig;
      console.log(`Loaded config from: ${configPath}`);
    } catch (err) {
      // Try user config directory
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const userConfigPath = path.join(home, '.config', 'agentenv', 'agentenv.toml');
      try {
        const data = readFileSync(userConfigPath, 'utf-8');
        config = toml.parse(data) as AgentenvConfig;
        configPath = userConfigPath;
        console.log(`Loaded config from: ${configPath}`);
      } catch (err2) {
        console.error('Error: Could not find agentenv.toml in current directory or user config');
        console.error(`Tried: ${configPath}, ${userConfigPath}`);
        process.exit(1);
      }
    }

    // Determine base directory
    const baseDir = config.scope === 'user' 
      ? path.join(process.env.HOME || process.env.USERPROFILE || '', '.config', 'agentenv')
      : '.';

    console.log(`Scope: ${config.scope || 'project'}`);
    console.log(`Base directory: ${baseDir}\n`);

    // Step 2: Tier 0 shell check/fix
    console.log('Step 1/5: Tier 0 Shell Detection/Fix');
    if (config.tier0?.check_enabled !== false) {
      // Placeholder for actual implementation
      console.log('  Checking shell environment...');
      console.log('  Tier 0 check: OK (placeholder)\n');
    } else {
      console.log('  Tier 0 check disabled\n');
    }

    // Step 3: Generate mise.toml
    console.log('Step 2/5: Generating mise.toml');
    const miseTools = [];
    
    // Helper to add tool if enabled
    const addTool = (configKey: string, miseName: string) => {
      if (config.tools?.[configKey as keyof NonNullable<AgentenvConfig['tools']>]) {
        miseTools.push(miseName);
      }
    };

    // Tier 1
    addTool('ripgrep', 'ripgrep');
    addTool('fd', 'fd');
    addTool('jq', 'jq');
    addTool('rtk', 'rtk');

    // Tier 2
    addTool('ast_grep', 'ast-grep');
    addTool('git_delta', 'delta');
    // universal_ctags skipped - not in mise registry
    addTool('gh', 'gh');
    addTool('difftastic', 'difftastic');

    // Tier 3
    addTool('yq', 'yq');
    addTool('bat', 'bat');
    addTool('eza', 'eza');
    addTool('miller', 'miller');
    addTool('tokei', 'tokei');
    addTool('hyperfine', 'hyperfine');
    addTool('fzf', 'fzf');
    addTool('just', 'just');
    addTool('watchexec', 'watchexec');
    addTool('direnv', 'direnv');

    // Custom tools
    for (const ct of config.custom_tools || []) {
      if (ct.mise_source) {
        miseTools.push(ct.mise_source);
      }
    }

    const miseTOMLPath = path.join(baseDir, 'mise.toml');
    let miseContent = '# mise.toml - Generated by agentenv\n';
    miseContent += '# Do not edit directly; edit agentenv.toml instead\n\n';
    miseContent += '[tools]\n';
    
    for (const tool of miseTools) {
      miseContent += `${tool} = "latest"\n`;
    }

    try {
      await fs.mkdir(path.dirname(miseTOMLPath), { recursive: true });
      await fs.writeFile(miseTOMLPath, miseContent);
      console.log(`  Generated mise.toml at: ${miseTOMLPath}`);
    } catch (err) {
      console.error(`  Error writing mise.toml: ${err}`);
    }
    console.log();

    // Step 4: Run mise install (placeholder)
    console.log('Step 3/5: Running mise install');
    console.log('  mise install (placeholder - would run mise install here)\n');

    // Step 5: Generate AGENTS.md and CLAUDE.md
    console.log('Step 4/5: Generating AGENTS.md and CLAUDE.md');
    
    // Collect enabled agents
    const enabledAgents = [];
    if (config.agents?.claude_code) enabledAgents.push('Claude Code');
    if (config.agents?.codex_cli) enabledAgents.push('Codex CLI');
    if (config.agents?.copilot) enabledAgents.push('GitHub Copilot');
    if (config.agents?.opencode) enabledAgents.push('OpenCode');

    // Collect enabled tools
    const enabledTools = [];
    const toolConfig = config.tools || {};
    
    for (const [toolKey, isEnabled] of Object.entries(toolConfig)) {
      if (isEnabled && BINARY_MAP[toolKey]) {
        enabledTools.push(toolKey);
      }
    }

    // Generate AGENTS.md
    const markerStart = config.generate?.marker_start || '<!-- agentenv-managed-start -->';
    const markerEnd = config.generate?.marker_end || '<!-- agentenv-managed-end -->';
    
    let agentsMDContent = '# AI Coding Agent Instructions\n\n';
    agentsMDContent += 'This file provides instructions for AI coding agents operating in this repository.\n\n';
    agentsMDContent += '## Supported Agents\n\n';
    agentsMDContent += `${markerStart}\n`;
    agentsMDContent += enabledAgents.map(a => `- ${a}`).join('\n') + '\n';
    agentsMDContent += `${markerEnd}\n\n`;
    agentsMDContent += '## Available Tools\n\n';
    agentsMDContent += 'The following tools are available via agentenv:\n\n';
    agentsMDContent += `${markerStart}\n`;
    
    // Group tools by category
    agentsMDContent += '### Search & Text Processing\n';
    for (const tool of enabledTools) {
      if (['ripgrep', 'fd', 'jq', 'yq', 'ast-grep'].includes(tool)) {
        agentsMDContent += `- **${tool}**: ${TOOL_DESCRIPTIONS[tool] || 'Available via agentenv'}\n`;
      }
    }
    
    agentsMDContent += '\n### Code Navigation\n';
    for (const tool of enabledTools) {
      if (['git-delta', 'difftastic', 'gh'].includes(tool)) {
        agentsMDContent += `- **${tool}**: ${TOOL_DESCRIPTIONS[tool] || 'Available via agentenv'}\n`;
      }
    }
    
    agentsMDContent += '\n### Utilities\n';
    for (const tool of enabledTools) {
      if (['bat', 'eza', 'miller', 'tokei', 'hyperfine', 'fzf', 'just', 'watchexec', 'direnv'].includes(tool)) {
        agentsMDContent += `- **${tool}**: ${TOOL_DESCRIPTIONS[tool] || 'Available via agentenv'}\n`;
      }
    }
    
    if (config.rtk?.enabled) {
      agentsMDContent += '\n### Token Optimization\n';
      agentsMDContent += '- **rtk**: Command proxy that reduces token consumption by 60-90% on common dev commands\n';
    }
    
    agentsMDContent += `${markerEnd}\n\n`;
    agentsMDContent += '## General Instructions\n\n';
    agentsMDContent += '- Prefer using the tools listed above for their respective tasks\n';
    agentsMDContent += '- For file search, use `rg` (ripgrep) instead of `grep -r`\n';
    agentsMDContent += '- For finding files, use `fd` instead of `find`\n';

    const agentsMDPath = path.join(baseDir, 'AGENTS.md');
    try {
      await fs.mkdir(path.dirname(agentsMDPath), { recursive: true });
      await fs.writeFile(agentsMDPath, agentsMDContent);
      console.log(`  Generated AGENTS.md at: ${agentsMDPath}`);
    } catch (err) {
      console.error(`  Error writing AGENTS.md: ${err}`);
    }

    // Generate CLAUDE.md
    const claudemdPath = path.join(baseDir, 'CLAUDE.md');
    const claudemdContent = '# CLAUDE.md\n\nPlease see [AGENTS.md](./AGENTS.md) for AI agent instructions.\n';
    try {
      await fs.mkdir(path.dirname(claudemdPath), { recursive: true });
      await fs.writeFile(claudemdPath, claudemdContent);
      console.log(`  Generated CLAUDE.md at: ${claudemdPath}`);
    } catch (err) {
      console.error(`  Error writing CLAUDE.md: ${err}`);
    }
    console.log();

    // Step 6: Generate per-agent hooks
    console.log('Step 5/5: Generating per-agent hooks');
    
    if (config.agents?.claude_code && config.rtk?.init?.claude_code) {
      console.log('  Configuring Claude Code...');
      console.log('    - Would generate .claude/settings.json with rtk hook');
      console.log('    - Would generate .claude/CLAUDE.md');
    }
    
    if (config.agents?.codex_cli && config.rtk?.init?.codex_cli) {
      console.log('  Configuring Codex CLI...');
      console.log('    - Would generate .codex/config.toml');
      console.log('    - Would generate .codex/hooks.json');
    }
    
    if (config.agents?.copilot && config.rtk?.init?.copilot) {
      console.log('  Configuring GitHub Copilot...');
      console.log('    - Would generate ~/.copilot/hooks/*');
    }
    
    if (config.agents?.opencode && config.rtk?.init?.opencode) {
      console.log('  Configuring OpenCode...');
      console.log('    - Would generate ~/.config/opencode/plugins/*');
      console.log('    - Would generate ~/.config/opencode/opencode.json');
    }

    console.log('\n=== Apply Complete ===');
    console.log('Configuration applied successfully.');
    console.log('Note: Some steps may require manual intervention (marked with \'Would\').\n');
  });
