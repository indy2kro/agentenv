/**
 * Agentenv Configuration Schema
 * Defines the structure and validation for agentenv.toml
 */

import * as fs from 'fs';
import * as path from 'path';
import toml from 'toml';

export interface CustomTool {
  name: string;
  description: string;
  already_installed?: boolean;
  path_windows?: string;
  path_macos?: string;
  path_linux?: string;
  mise_source?: string;
  version?: string;
}

export interface RtkConfig {
  enabled?: boolean;
  init?: {
    claude_code?: boolean;
    codex_cli?: boolean;
    copilot?: boolean;
    opencode?: boolean;
  };
}

export interface Tier0Config {
  check_enabled?: boolean;
  git_bash_path?: string;
}

export interface GenerateConfig {
  marker_start?: string;
  marker_end?: string;
  files?: string[];
}

export interface AdvancedConfig {
  default_mode?: string;
  show_diff_preview?: boolean;
}

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
  custom_tools?: CustomTool[];
  rtk?: RtkConfig;
  tier0?: Tier0Config;
  generate?: GenerateConfig;
  advanced?: AdvancedConfig;
}

// Default configuration values
export const DEFAULT_CONFIG: AgentenvConfig = {
  scope: 'project',
  agents: {
    claude_code: true,
    codex_cli: true,
    copilot: true,
    opencode: true,
  },
  tools: {
    // Tier 1 - always enabled by default
    ripgrep: true,
    fd: true,
    jq: true,
    rtk: true,
    // Tier 2 - enabled by default
    ast_grep: true,
    git_delta: true,
    gh: true,
    difftastic: true,
    // Tier 3 - disabled by default
    universal_ctags: false,
    yq: false,
    bat: false,
    eza: false,
    miller: false,
    tokei: false,
    hyperfine: false,
    fzf: false,
    just: false,
    watchexec: false,
    direnv: false,
  },
  rtk: {
    enabled: true,
    init: {
      claude_code: true,
      codex_cli: true,
      copilot: true,
      opencode: true,
    },
  },
  tier0: {
    check_enabled: true,
  },
  generate: {
    marker_start: '<!-- agentenv-managed-start -->',
    marker_end: '<!-- agentenv-managed-end -->',
    files: ['AGENTS.md', 'CLAUDE.md'],
  },
};

// Tool tiers for categorization
export const TOOL_TIERS: Record<string, number> = {
  // Tier 1 - essential
  ripgrep: 1,
  fd: 1,
  jq: 1,
  rtk: 1,
  // Tier 2 - AI-coding value-add
  ast_grep: 2,
  git_delta: 2,
  universal_ctags: 2,
  gh: 2,
  difftastic: 2,
  // Tier 3 - power-user
  yq: 3,
  bat: 3,
  eza: 3,
  miller: 3,
  tokei: 3,
  hyperfine: 3,
  fzf: 3,
  just: 3,
  watchexec: 3,
  direnv: 3,
};

// Binary name mappings (TOML key -> binary name)
export const BINARY_MAP: Record<string, string> = {
  ripgrep: 'rg',
  fd: 'fd',
  jq: 'jq',
  rtk: 'rtk',
  ast_grep: 'sg',
  git_delta: 'delta',
  universal_ctags: 'ctags',
  gh: 'gh',
  difftastic: 'difft',
  yq: 'yq',
  bat: 'bat',
  eza: 'eza',
  miller: 'mlr',
  tokei: 'tokei',
  hyperfine: 'hyperfine',
  fzf: 'fzf',
  just: 'just',
  watchexec: 'watchexec',
  direnv: 'direnv',
};

// Tool descriptions
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  ripgrep: 'Fast text search (use instead of grep -r)',
  fd: 'Fast, user-friendly file finder',
  jq: 'Lightweight and flexible command-line JSON processor',
  rtk: 'CLI proxy that reduces LLM token consumption by 60-90%',
  ast_grep: 'Structural/AST-based code search and rewrite',
  git_delta: 'Syntax-highlighted git diff pager',
  universal_ctags: 'Universal ctags for code navigation',
  difftastic: 'Structural diff tool that understands syntax',
  gh: 'GitHub CLI for repository operations',
  yq: 'YAML/TOML processor (jq for YAML)',
  bat: 'cat clone with syntax highlighting and git integration',
  eza: 'Modern replacement for ls',
  miller: 'CSV/TSV data processing',
  tokei: 'Fast code statistics (LOC, etc.)',
  hyperfine: 'Command-line benchmarking tool',
  fzf: 'Fuzzy finder with non-interactive filter mode',
  just: 'Command runner for project recipes',
  watchexec: 'File watcher that runs commands on changes',
  direnv: 'Environment variable manager',
};

/**
 * Load configuration from agentenv.toml file
 * Searches in current directory, then user config directory
 */
export function loadConfig(configPath?: string): AgentenvConfig {
  let pathToLoad = configPath;

  if (!pathToLoad) {
    // Try current directory
    try {
      if (fs.existsSync('agentenv.toml')) {
        pathToLoad = 'agentenv.toml';
      }
    } catch {
      // Ignore
    }

    // Try user config directory
    if (!pathToLoad) {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const userConfigPath = path.join(home, '.config', 'agentenv', 'agentenv.toml');
      try {
        if (fs.existsSync(userConfigPath)) {
          pathToLoad = userConfigPath;
        }
      } catch {
        // Ignore
      }
    }
  }

  if (!pathToLoad) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const data = fs.readFileSync(pathToLoad, 'utf-8');
    const parsed = toml.parse(data) as AgentenvConfig;
    return mergeWithDefaults(parsed);
  } catch (err) {
    console.error(`Error loading config from ${pathToLoad}: ${err}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to agentenv.toml file
 */
export function saveConfig(config: AgentenvConfig, configPath: string): void {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const tomlString = configToToml(config);
    fs.writeFileSync(configPath, tomlString);
  } catch (err) {
    throw new Error(`Failed to save config: ${err}`);
  }
}

/**
 * Convert configuration object to TOML string
 */
export function configToToml(config: AgentenvConfig): string {
  const lines: string[] = [];

  // Scope
  if (config.scope) {
    lines.push(`scope = "${config.scope}"`);
  }

  // Agents
  if (config.agents) {
    lines.push('\n[agents]');
    if (config.agents.claude_code !== undefined) lines.push(`claude_code = ${config.agents.claude_code}`);
    if (config.agents.codex_cli !== undefined) lines.push(`codex_cli = ${config.agents.codex_cli}`);
    if (config.agents.copilot !== undefined) lines.push(`copilot = ${config.agents.copilot}`);
    if (config.agents.opencode !== undefined) lines.push(`opencode = ${config.agents.opencode}`);
  }

  // Tools
  if (config.tools) {
    lines.push('\n[tools]');
    const toolKeys = [
      'ripgrep', 'fd', 'jq', 'rtk', 'ast_grep', 'git_delta', 'universal_ctags',
      'gh', 'difftastic', 'yq', 'bat', 'eza', 'miller', 'tokei',
      'hyperfine', 'fzf', 'just', 'watchexec', 'direnv'
    ] as const;
    for (const key of toolKeys) {
      if (config.tools[key as keyof AgentenvConfig['tools']] !== undefined) {
        lines.push(`${key} = ${config.tools[key as keyof AgentenvConfig['tools']]}`);
      }
    }
  }

  // Custom tools
  if (config.custom_tools && config.custom_tools.length > 0) {
    lines.push('\n[[custom_tools]]');
    for (const ct of config.custom_tools) {
      lines.push(`name = "${ct.name}"`);
      lines.push(`description = "${ct.description}"`);
      if (ct.already_installed !== undefined) lines.push(`already_installed = ${ct.already_installed}`);
      if (ct.mise_source) lines.push(`mise_source = "${ct.mise_source}"`);
      if (ct.version) lines.push(`version = "${ct.version}"`);
      if (ct.path_windows) lines.push(`path_windows = "${ct.path_windows}"`);
      if (ct.path_macos) lines.push(`path_macos = "${ct.path_macos}"`);
      if (ct.path_linux) lines.push(`path_linux = "${ct.path_linux}"`);
    }
  }

  // RTK
  if (config.rtk) {
    lines.push('\n[rtk]');
    if (config.rtk.enabled !== undefined) lines.push(`enabled = ${config.rtk.enabled}`);
    if (config.rtk.init) {
      lines.push('\n[rtk.init]');
      if (config.rtk.init.claude_code !== undefined) lines.push(`claude_code = ${config.rtk.init.claude_code}`);
      if (config.rtk.init.codex_cli !== undefined) lines.push(`codex_cli = ${config.rtk.init.codex_cli}`);
      if (config.rtk.init.copilot !== undefined) lines.push(`copilot = ${config.rtk.init.copilot}`);
      if (config.rtk.init.opencode !== undefined) lines.push(`opencode = ${config.rtk.init.opencode}`);
    }
  }

  // Tier0
  if (config.tier0) {
    lines.push('\n[tier0]');
    if (config.tier0.check_enabled !== undefined) lines.push(`check_enabled = ${config.tier0.check_enabled}`);
    if (config.tier0.git_bash_path) lines.push(`git_bash_path = "${config.tier0.git_bash_path}"`);
  }

  // Generate
  if (config.generate) {
    lines.push('\n[generate]');
    if (config.generate.marker_start) lines.push(`marker_start = "${config.generate.marker_start}"`);
    if (config.generate.marker_end) lines.push(`marker_end = "${config.generate.marker_end}"`);
    if (config.generate.files) lines.push(`files = [${config.generate.files.map(f => `"${f}"`).join(', ')}]`);
  }

  return lines.join('\n');
}

/**
 * Merge provided config with defaults (missing properties get default values)
 */
function mergeWithDefaults(config: AgentenvConfig): AgentenvConfig {
  const result: AgentenvConfig = { ...DEFAULT_CONFIG };

  // Merge scope
  if (config.scope !== undefined) {
    result.scope = config.scope;
  }

  // Merge agents
  if (config.agents) {
    result.agents = {
      claude_code: config.agents.claude_code ?? DEFAULT_CONFIG.agents?.claude_code,
      codex_cli: config.agents.codex_cli ?? DEFAULT_CONFIG.agents?.codex_cli,
      copilot: config.agents.copilot ?? DEFAULT_CONFIG.agents?.copilot,
      opencode: config.agents.opencode ?? DEFAULT_CONFIG.agents?.opencode,
    };
  }

  // Merge tools
  if (config.tools) {
    result.tools = {
      ripgrep: config.tools.ripgrep ?? DEFAULT_CONFIG.tools?.ripgrep,
      fd: config.tools.fd ?? DEFAULT_CONFIG.tools?.fd,
      jq: config.tools.jq ?? DEFAULT_CONFIG.tools?.jq,
      rtk: config.tools.rtk ?? DEFAULT_CONFIG.tools?.rtk,
      ast_grep: config.tools.ast_grep ?? DEFAULT_CONFIG.tools?.ast_grep,
      git_delta: config.tools.git_delta ?? DEFAULT_CONFIG.tools?.git_delta,
      universal_ctags: config.tools.universal_ctags ?? DEFAULT_CONFIG.tools?.universal_ctags,
      gh: config.tools.gh ?? DEFAULT_CONFIG.tools?.gh,
      difftastic: config.tools.difftastic ?? DEFAULT_CONFIG.tools?.difftastic,
      yq: config.tools.yq ?? DEFAULT_CONFIG.tools?.yq,
      bat: config.tools.bat ?? DEFAULT_CONFIG.tools?.bat,
      eza: config.tools.eza ?? DEFAULT_CONFIG.tools?.eza,
      miller: config.tools.miller ?? DEFAULT_CONFIG.tools?.miller,
      tokei: config.tools.tokei ?? DEFAULT_CONFIG.tools?.tokei,
      hyperfine: config.tools.hyperfine ?? DEFAULT_CONFIG.tools?.hyperfine,
      fzf: config.tools.fzf ?? DEFAULT_CONFIG.tools?.fzf,
      just: config.tools.just ?? DEFAULT_CONFIG.tools?.just,
      watchexec: config.tools.watchexec ?? DEFAULT_CONFIG.tools?.watchexec,
      direnv: config.tools.direnv ?? DEFAULT_CONFIG.tools?.direnv,
    };
  }

  // Merge custom_tools
  if (config.custom_tools) {
    result.custom_tools = config.custom_tools;
  }

  // Merge rtk
  if (config.rtk) {
    result.rtk = {
      enabled: config.rtk.enabled ?? DEFAULT_CONFIG.rtk?.enabled,
      init: {
        claude_code: config.rtk.init?.claude_code ?? DEFAULT_CONFIG.rtk?.init?.claude_code,
        codex_cli: config.rtk.init?.codex_cli ?? DEFAULT_CONFIG.rtk?.init?.codex_cli,
        copilot: config.rtk.init?.copilot ?? DEFAULT_CONFIG.rtk?.init?.copilot,
        opencode: config.rtk.init?.opencode ?? DEFAULT_CONFIG.rtk?.init?.opencode,
      },
    };
  }

  // Merge tier0
  if (config.tier0) {
    result.tier0 = {
      check_enabled: config.tier0.check_enabled ?? DEFAULT_CONFIG.tier0?.check_enabled,
      git_bash_path: config.tier0.git_bash_path ?? DEFAULT_CONFIG.tier0?.git_bash_path,
    };
  }

  // Merge generate
  if (config.generate) {
    result.generate = {
      marker_start: config.generate.marker_start ?? DEFAULT_CONFIG.generate?.marker_start,
      marker_end: config.generate.marker_end ?? DEFAULT_CONFIG.generate?.marker_end,
      files: config.generate.files ?? DEFAULT_CONFIG.generate?.files,
    };
  }

  // Merge advanced
  if (config.advanced) {
    result.advanced = {
      default_mode: config.advanced.default_mode ?? DEFAULT_CONFIG.advanced?.default_mode,
      show_diff_preview: config.advanced.show_diff_preview ?? DEFAULT_CONFIG.advanced?.show_diff_preview,
    };
  }

  return result;
}

/**
 * Get enabled agents from config
 */
export function getEnabledAgents(config: AgentenvConfig): string[] {
  const agents = config.agents || DEFAULT_CONFIG.agents || {};
  const enabled: string[] = [];
  if (agents.claude_code) enabled.push('claude_code');
  if (agents.codex_cli) enabled.push('codex_cli');
  if (agents.copilot) enabled.push('copilot');
  if (agents.opencode) enabled.push('opencode');
  return enabled;
}

/**
 * Get enabled tools from config
 */
export function getEnabledTools(config: AgentenvConfig): string[] {
  const tools = config.tools || DEFAULT_CONFIG.tools || {};
  const enabled: string[] = [];
  
  const toolKeys = [
    'ripgrep', 'fd', 'jq', 'rtk', 'ast_grep', 'git_delta', 'universal_ctags',
    'gh', 'difftastic', 'yq', 'bat', 'eza', 'miller', 'tokei',
    'hyperfine', 'fzf', 'just', 'watchexec', 'direnv'
  ];
  
  for (const key of toolKeys) {
    if (tools[key as keyof AgentenvConfig['tools']]) {
      enabled.push(key);
    }
  }
  
  // Add custom tools
  if (config.custom_tools) {
    for (const ct of config.custom_tools) {
      if (ct.already_installed || ct.mise_source) {
        enabled.push(ct.name);
      }
    }
  }
  
  return enabled;
}
