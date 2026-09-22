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
  taplo: 'Linting & Security',
  hadolint: 'Linting & Security',
  trivy: 'Linting & Security',

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
 * Per-tool tips for the "General Instructions" section. Only tools that are
 * actually enabled get a tip, so agents are never told to use a binary that
 * isn't installed (BUG-04). `bat`/`git_delta` point agents at non-interactive
 * flags/commands instead of a pager, since agents run without a TTY (UX-01).
 */
const GENERAL_INSTRUCTION_TIPS: Record<string, string> = {
  ripgrep: 'For file search, use `rg` (ripgrep) instead of `grep -r`',
  fd: 'For finding files, use `fd` instead of `find`',
  jq: 'For JSON processing, use `jq`',
  bat: 'For viewing files, use `bat --plain --paging=never` instead of `cat` (skips the pager and decorations, which matter for a human, not an agent)',
  eza: 'For directory listings, use `eza` instead of `ls`',
  git_delta:
    '`delta` gives syntax-highlighted diffs for human review; run `git --no-pager diff` (or plain `git diff`) directly instead of piping through it',
};

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
  const isUserScope = config.scope === 'user';

  // Keep all agentenv-owned content in a single block. User-authored content
  // can safely live before or after it.
  lines.push(markerStart);

  // Header
  lines.push('# AI Coding Agent Instructions');
  lines.push('');
  lines.push(
    isUserScope
      ? 'This file provides instructions for AI coding agents, configured globally by agentenv.'
      : 'This file provides instructions for AI coding agents operating in this repository.',
  );
  lines.push('');

  // Available Tools section
  lines.push('## Available Tools');
  lines.push('');
  lines.push('The following tools are available via agentenv:');
  lines.push('');

  const enabledTools = getEnabledToolsForOutput(config);
  const categorizedTools = categorizeTools(
    config.rtk?.enabled ? enabledTools.filter((tool) => tool !== 'rtk') : enabledTools,
  );

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

  // A single rtk section (catalog entry + usage notes combined, rather than
  // repeating the same "rewrites commands to save tokens" claim twice under
  // two separate headings — UX-03).
  if (config.rtk?.enabled) {
    lines.push('### Token Optimization');
    lines.push('');
    lines.push(
      '- **rtk** (binary: `rtk`): CLI proxy that reduces LLM token consumption by 60-90% on common dev commands',
    );
    lines.push(
      '  - Automatically rewrites commands like `grep`, `find`, `cat`, etc. to faster, more token-efficient alternatives; output is truncated to reduce token usage while preserving essential information',
    );
    lines.push(
      "  - If a rewrite misbehaves (e.g. drops a flag it doesn't understand), run `rtk proxy <cmd>` to execute the original command unmodified",
    );
    lines.push('  - Use `rtk --help` for more information');
    lines.push('');
  }

  lines.push('');

  // General Instructions section — generated from the enabled tools so an
  // agent is never told to use a binary that isn't actually available.
  lines.push('## General Instructions');
  lines.push('');
  lines.push('- Prefer using the tools listed above for their respective tasks');
  for (const tool of enabledTools) {
    const tip = GENERAL_INSTRUCTION_TIPS[tool];
    if (tip) lines.push(`- ${tip}`);
  }

  lines.push('');
  lines.push('## Environment Notes');
  lines.push('');
  if (isUserScope) {
    lines.push(
      '- This machine has been configured with agentenv (user scope) for optimal AI coding agent performance',
    );
    lines.push('- Tools are managed via [mise](https://mise.jdx.dev)');
    lines.push(
      '- If a listed tool is missing, run `mise trust` and `mise install` in your agentenv user config directory (`~/.config/agentenv` by default, or `$XDG_CONFIG_HOME/agentenv`)',
    );
  } else {
    lines.push(
      '- This repository has been configured with agentenv for optimal AI coding agent performance',
    );
    lines.push('- Tools are managed via [mise](https://mise.jdx.dev)');
    lines.push(
      '- If a listed tool is missing, run `mise trust` and `mise install` in the repo root',
    );
  }
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
 * The instruction files agentenv can generate. `config.generate.files` may
 * request a subset (e.g. only AGENTS.md) so output repos are never handed a
 * CLAUDE.md they don't want.
 */
export const GENERATED_FILE_NAMES = ['AGENTS.md', 'CLAUDE.md'] as const;

/**
 * Generate the requested AGENTS.md / CLAUDE.md files, honoring
 * `config.generate.files` (default: both). Files outside that list are never
 * produced here; a config requesting only unknown names yields an empty list.
 */
export function generateInstructionFiles(
  config: AgentenvConfig,
  baseDir: string = '.',
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const requested =
    config.generate?.files && config.generate.files.length > 0
      ? config.generate.files
      : GENERATED_FILE_NAMES;

  if (requested.includes('AGENTS.md')) {
    files.push({
      path: path.join(baseDir, 'AGENTS.md'),
      content: generateAgentsMd(config),
    });
  }

  if (requested.includes('CLAUDE.md')) {
    files.push({
      path: path.join(baseDir, 'CLAUDE.md'),
      content: generateClaudeMd(config),
    });
  }

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

    const hasStart = existingContent.includes(markerStart);
    const hasEnd = existingContent.includes(markerEnd);

    // Only one marker present means a crashed/incomplete prior write; treat
    // the file as broken rather than appending a second block, which the next
    // pass would otherwise replace from the first start-marker to the later
    // end-marker — clobbering any user text between them.
    if (hasStart !== hasEnd) {
      return {
        success: false,
        updated: false,
        message: `File ${filePath} contains only one managed marker (a partial write); leaving it untouched`,
      };
    }

    // Existing files without markers belong to the user. Preserve them and
    // append only our newly managed block.
    if (!hasStart) {
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
