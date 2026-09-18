/**
 * AGENTS.md and CLAUDE.md Generation
 * Generates instruction files for AI coding agents
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentenvConfig, BINARY_MAP, TOOL_DESCRIPTIONS, DEFAULT_CONFIG } from '../config/schema.js';
import { writeFileWithRetry } from '../utils/fs-retry.js';

// Tool categories for organization
export const TOOL_CATEGORIES: Record<string, string> = {
  // Search & Text Processing
  ripgrep: 'Search & Text Processing',
  fd: 'Search & Text Processing',
  jq: 'Search & Text Processing',
  yq: 'Search & Text Processing',
  ast_grep: 'Search & Text Processing',
  ripgrep_all: 'Search & Text Processing',
  sd: 'Search & Text Processing',

  // Code Navigation
  git_delta: 'Code Navigation',
  difftastic: 'Code Navigation',
  gh: 'Code Navigation',

  // Utilities
  bat: 'Utilities',
  eza: 'Utilities',
  miller: 'Utilities',
  tokei: 'Utilities',
  hyperfine: 'Utilities',
  fzf: 'Utilities',
  just: 'Utilities',
  watchexec: 'Utilities',
  direnv: 'Utilities',
  zoxide: 'Utilities',
  uv: 'Utilities',
  xh: 'Utilities',
  gum: 'Utilities',
  glow: 'Utilities',

  // Token Optimization
  rtk: 'Token Optimization',

  // Linting & Security
  shellcheck: 'Linting & Security',
  actionlint: 'Linting & Security',
  gitleaks: 'Linting & Security',

  // Data & Analysis
  duckdb: 'Data & Analysis',
  qsv: 'Data & Analysis',

  // Docs & Reading
  jless: 'Docs & Reading',
  tealdeer: 'Docs & Reading',
};

export interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * Generate AGENTS.md content from configuration
 */
export function generateAgentsMd(config: AgentenvConfig): string {
  const lines: string[] = [];
  const markerStart =
    config.generate?.marker_start ||
    DEFAULT_CONFIG.generate?.marker_start ||
    '<!-- agentenv-managed-start -->';
  const markerEnd =
    config.generate?.marker_end ||
    DEFAULT_CONFIG.generate?.marker_end ||
    '<!-- agentenv-managed-end -->';

  // Keep all agentenv-owned content in a single block. User-authored content
  // can safely live before or after it.
  lines.push(markerStart);

  // Header
  lines.push('# AI Coding Agent Instructions');
  lines.push('');
  lines.push('This file provides instructions for AI coding agents operating in this repository.');
  lines.push('');

  // Supported Agents section
  lines.push('## Supported Agents');
  lines.push('');

  const enabledAgents = getEnabledAgentsForOutput(config);
  if (enabledAgents.length > 0) {
    for (const agent of enabledAgents) {
      lines.push(`- ${agent}`);
    }
  } else {
    lines.push('- No agents configured');
  }

  lines.push('');

  // Available Tools section
  lines.push('## Available Tools');
  lines.push('');
  lines.push('The following tools are available via agentenv:');
  lines.push('');

  const enabledTools = getEnabledToolsForOutput(config);
  const categorizedTools = categorizeTools(enabledTools);

  for (const [category, tools] of Object.entries(categorizedTools)) {
    if (tools.length > 0) {
      lines.push(`### ${category}`);
      lines.push('');
      for (const tool of tools) {
        const description = TOOL_DESCRIPTIONS[tool] || 'Available via agentenv';
        const binaryName = BINARY_MAP[tool] || tool;
        lines.push(`- **${tool}** (binary: \`${binaryName}\`): ${description}`);
      }
      lines.push('');
    }
  }

  // RTK special section
  if (config.rtk?.enabled) {
    lines.push('### Token Optimization');
    lines.push('');
    lines.push(
      '- **rtk**: CLI proxy that reduces LLM token consumption by 60-90% on common dev commands',
    );
    lines.push(
      '  - Automatically rewrites commands like `grep`, `find`, `cat`, etc. to faster, more token-efficient alternatives',
    );
    lines.push('  - Maintains command semantics while optimizing for LLM context');
    lines.push('');
  }

  lines.push('');

  // General Instructions section
  lines.push('## General Instructions');
  lines.push('');
  lines.push('- Prefer using the tools listed above for their respective tasks');
  lines.push('- For file search, use `rg` (ripgrep) instead of `grep -r`');
  lines.push('- For finding files, use `fd` instead of `find`');
  lines.push('- For JSON processing, use `jq`');
  lines.push('- For viewing files, use `bat` instead of `cat`');
  lines.push('- For directory listings, use `eza` instead of `ls`');
  lines.push('- When working with git diffs, use `delta` for syntax-highlighted output');

  if (config.rtk?.enabled) {
    lines.push('');
    lines.push('## RTK Configuration');
    lines.push('');
    lines.push('RTK (Red Teaming Kit) is enabled and will optimize your commands:');
    lines.push('- Commands are automatically rewritten to use the most efficient tools available');
    lines.push(
      '- Output is truncated to reduce token usage while preserving essential information',
    );
    lines.push('- Use `rtk --help` for more information about RTK');
  }

  lines.push('');
  lines.push('## Environment Notes');
  lines.push('');
  lines.push(
    '- This repository has been configured with agentenv for optimal AI coding agent performance',
  );
  lines.push('- Tools are managed via [mise](https://mise.jdx.dev)');
  lines.push('- If a listed tool is missing, run `mise trust` and `mise install` in the repo root');
  lines.push('- Configuration is managed in `agentenv.toml`');
  lines.push('');
  lines.push(markerEnd);

  return lines.join('\n');
}

/**
 * Generate CLAUDE.md content
 * Points to AGENTS.md since Claude Code doesn't read AGENTS.md natively yet
 */
export function generateClaudeMd(config: AgentenvConfig = DEFAULT_CONFIG): string {
  const lines: string[] = [];
  const markerStart =
    config.generate?.marker_start ||
    DEFAULT_CONFIG.generate?.marker_start ||
    '<!-- agentenv-managed-start -->';
  const markerEnd =
    config.generate?.marker_end ||
    DEFAULT_CONFIG.generate?.marker_end ||
    '<!-- agentenv-managed-end -->';

  lines.push(markerStart);

  lines.push('# CLAUDE.md');
  lines.push('');
  lines.push('This file provides Claude Code-specific instructions.');
  lines.push('');
  lines.push('## General Instructions');
  lines.push('');
  lines.push('Please see [AGENTS.md](./AGENTS.md) for the complete list of AI agent instructions.');
  lines.push('');
  lines.push('The instructions in AGENTS.md apply to Claude Code as well.');
  lines.push('');
  lines.push('## Claude Code Specific Notes');
  lines.push('');
  lines.push('- AGENTS.md is the source of truth for tool availability and usage instructions');
  lines.push('- All tools listed in AGENTS.md are available for use');
  lines.push('- RTK hooks are configured to optimize command execution');
  lines.push('');
  lines.push(markerEnd);

  return lines.join('\n');
}

/**
 * Categorize tools by their category
 */
function categorizeTools(tools: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {};

  for (const tool of tools) {
    const category = TOOL_CATEGORIES[tool] || 'Other';
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(tool);
  }

  return categories;
}

/**
 * Get enabled agents for output (formatted names)
 */
function getEnabledAgentsForOutput(config: AgentenvConfig): string[] {
  const agents = config.agents || DEFAULT_CONFIG.agents || {};
  const enabled: string[] = [];

  if (agents.claude_code) enabled.push('Claude Code');
  if (agents.codex_cli) enabled.push('Codex CLI');
  if (agents.copilot) enabled.push('GitHub Copilot');
  if (agents.opencode) enabled.push('OpenCode');
  if (agents.gemini_cli) enabled.push('Gemini CLI');
  if (agents.cursor) enabled.push('Cursor');
  if (agents.windsurf) enabled.push('Windsurf');
  if (agents.cline) enabled.push('Cline CLI');
  if (agents.vibe) enabled.push('Mistral Vibe');

  return enabled;
}

/**
 * Get enabled tools for output
 */
function getEnabledToolsForOutput(config: AgentenvConfig): string[] {
  const tools = config.tools || DEFAULT_CONFIG.tools || {};
  const enabled: string[] = [];

  const toolKeys = Object.keys(tools) as Array<keyof typeof tools>;

  for (const key of toolKeys) {
    if (tools[key]) {
      enabled.push(key);
    }
  }

  // Add custom tools that are installable via mise
  if (config.custom_tools) {
    for (const ct of config.custom_tools) {
      if (ct.mise_source) {
        enabled.push(ct.name);
      }
    }
  }

  return enabled;
}

/**
 * Generate both AGENTS.md and CLAUDE.md files
 */
export function generateInstructionFiles(
  config: AgentenvConfig,
  baseDir: string = '.',
): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  // Generate AGENTS.md
  const agentsMdPath = path.join(baseDir, 'AGENTS.md');
  const agentsMdContent = generateAgentsMd(config);
  files.push({
    path: agentsMdPath,
    content: agentsMdContent,
  });

  // Generate CLAUDE.md
  const claudemdPath = path.join(baseDir, 'CLAUDE.md');
  const claudemdContent = generateClaudeMd(config);
  files.push({
    path: claudemdPath,
    content: claudemdContent,
  });

  return files;
}

/**
 * Save generated files to disk
 */
export function saveGeneratedFiles(files: GeneratedFile[]): {
  success: boolean;
  saved: string[];
  errors: Array<{ path: string; error: string }>;
} {
  const saved: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const file of files) {
    try {
      fs.mkdirSync(path.dirname(file.path), { recursive: true });
      writeFileWithRetry(file.path, file.content);
      saved.push(file.path);
    } catch (err) {
      errors.push({
        path: file.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    success: errors.length === 0,
    saved,
    errors,
  };
}

/**
 * Update existing AGENTS.md/CLAUDE.md with new content, preserving user additions
 * Uses marker blocks to only replace the managed sections
 */
export function updateWithMarkers(
  filePath: string,
  newContent: string,
  markerStart: string,
  markerEnd: string,
): {
  success: boolean;
  updated: boolean;
  message: string;
} {
  try {
    if (!fs.existsSync(filePath)) {
      // File doesn't exist, just create it
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileWithRetry(filePath, newContent);
      return {
        success: true,
        updated: true,
        message: `Created ${filePath}`,
      };
    }

    const existingContent = fs.readFileSync(filePath, 'utf-8');

    // Existing files without markers belong to the user. Preserve them and
    // append only our newly managed block.
    if (!existingContent.includes(markerStart) || !existingContent.includes(markerEnd)) {
      const newStartIndex = newContent.indexOf(markerStart);
      const newEndIndex = newContent.indexOf(markerEnd, newStartIndex);
      if (newStartIndex === -1 || newEndIndex === -1) {
        return {
          success: false,
          updated: false,
          message: `Markers not found in new content`,
        };
      }

      const managedBlock = newContent.substring(newStartIndex, newEndIndex + markerEnd.length);
      const separator =
        existingContent.length === 0 || existingContent.endsWith('\n') ? '\n' : '\n\n';
      writeFileWithRetry(filePath, `${existingContent}${separator}${managedBlock}\n`);
      return {
        success: true,
        updated: true,
        message: `Added managed block to ${filePath}`,
      };
    }

    // Extract the parts before and after the markers
    const startIndex = existingContent.indexOf(markerStart);
    const endIndex = existingContent.indexOf(markerEnd, startIndex);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      return {
        success: false,
        updated: false,
        message: `Invalid marker positions in ${filePath}`,
      };
    }

    const before = existingContent.substring(0, startIndex);
    const after = existingContent.substring(endIndex + markerEnd.length);

    // Find the content between markers in the new content
    const newStartIndex = newContent.indexOf(markerStart);
    const newEndIndex = newContent.indexOf(markerEnd, newStartIndex);

    if (newStartIndex === -1 || newEndIndex === -1) {
      return {
        success: false,
        updated: false,
        message: `Markers not found in new content`,
      };
    }

    const newMiddle = newContent.substring(newStartIndex, newEndIndex + markerEnd.length);

    // Reconstruct the file
    const updatedContent = before + newMiddle + after;

    // Only write if content actually changed
    if (updatedContent !== existingContent) {
      writeFileWithRetry(filePath, updatedContent);
      return {
        success: true,
        updated: true,
        message: `Updated ${filePath}`,
      };
    }

    return {
      success: true,
      updated: false,
      message: `No changes needed for ${filePath}`,
    };
  } catch (err) {
    return {
      success: false,
      updated: false,
      message: `Error updating ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
