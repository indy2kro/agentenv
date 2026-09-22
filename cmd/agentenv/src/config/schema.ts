/**
 * Agentenv Configuration Schema
 * Defines the structure and validation for agentenv.toml
 */

import * as fs from 'fs';
import * as path from 'path';
import toml from 'toml';
import { writeFileWithVerify } from '../utils/fs-retry.js';
import { userConfigDir } from './scopes.js';

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
    gemini_cli?: boolean;
    cursor?: boolean;
    windsurf?: boolean;
    cline?: boolean;
    vibe?: boolean;
  };
}

export interface Tier0Config {
  check_enabled?: boolean;
  git_bash_path?: string;
  /**
   * Whether the Tier 0 Windows shell fix actually writes files, or only
   * checks and reports:
   *  - "auto" (default): write when stdin is a TTY, otherwise just report
   *    (the long-standing behavior).
   *  - "always": write every time, TTY or not — needed for an AI agent
   *    running `agentenv apply`/`setup --yes`, which never has a TTY but is
   *    exactly who Tier 0 exists for.
   *  - "never": never write; always just report, even with a TTY.
   */
  mode?: 'auto' | 'always' | 'never';
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

export interface IntegrationConfig {
  enabled?: boolean;
  source?: string;
  ref?: string;
  scope?: 'project' | 'user';
  agents?: string[];
  allow_hooks?: boolean;
  allow_external_requests?: boolean;
}

export interface IntegrationsConfig {
  superpowers?: IntegrationConfig;
}

export interface AgentenvConfig {
  scope?: 'project' | 'user';
  agents?: {
    claude_code?: boolean;
    codex_cli?: boolean;
    copilot?: boolean;
    opencode?: boolean;
    gemini_cli?: boolean;
    cursor?: boolean;
    windsurf?: boolean;
    cline?: boolean;
    vibe?: boolean;
  };
  tools?: {
    ripgrep?: boolean;
    fd?: boolean;
    jq?: boolean;
    rtk?: boolean;
    ast_grep?: boolean;
    git_delta?: boolean;
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
    // New tier-3 tools
    ripgrep_all?: boolean;
    zoxide?: boolean;
    shellcheck?: boolean;
    uv?: boolean;
    xh?: boolean;
    actionlint?: boolean;
    gitleaks?: boolean;
    gum?: boolean;
    glow?: boolean;
    jless?: boolean;
    sd?: boolean;
    tealdeer?: boolean;
    duckdb?: boolean;
    qsv?: boolean;
    taplo?: boolean;
    hadolint?: boolean;
    trivy?: boolean;
  };
  custom_tools?: CustomTool[];
  /**
   * Optional per-tool version pins, e.g. `jq = "1.7.1"`. A pinned tool is
   * installed at exactly that version and is excluded from `agentenv update`.
   * Unpinned tools resolve to `latest`.
   */
  tool_versions?: Record<string, string>;
  rtk?: RtkConfig;
  tier0?: Tier0Config;
  generate?: GenerateConfig;
  advanced?: AdvancedConfig;
  integrations?: IntegrationsConfig;
}

// Default configuration values
export const DEFAULT_CONFIG: AgentenvConfig = {
  scope: 'project',
  agents: {
    claude_code: true,
    codex_cli: true,
    copilot: false,
    opencode: false,
    gemini_cli: false,
    cursor: false,
    windsurf: false,
    cline: false,
    vibe: false,
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
    // New tier-3 tools (default: disabled)
    ripgrep_all: false,
    zoxide: false,
    shellcheck: false,
    uv: false,
    xh: false,
    actionlint: false,
    gitleaks: false,
    gum: false,
    glow: false,
    jless: false,
    sd: false,
    tealdeer: false,
    duckdb: false,
    qsv: false,
    taplo: false,
    hadolint: false,
    trivy: false,
  },
  rtk: {
    enabled: true,
    init: {
      claude_code: true,
      codex_cli: true,
      copilot: true,
      opencode: true,
      gemini_cli: true,
      cursor: true,
      windsurf: true,
      cline: true,
      vibe: true,
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
  integrations: {
    superpowers: {
      enabled: false,
      source: 'github:obra/superpowers',
      ref: 'v6.3.0',
      agents: ['claude_code', 'codex_cli', 'copilot', 'opencode'],
      allow_hooks: false,
      allow_external_requests: false,
    },
  },
};

// Known agent keys for validation
export const AGENT_KEYS = [
  'claude_code',
  'codex_cli',
  'copilot',
  'opencode',
  'gemini_cli',
  'cursor',
  'windsurf',
  'cline',
  'vibe',
] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

// Known integration keys for validation
export const INTEGRATION_KEYS = ['superpowers'] as const;
export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

// Known tool keys for validation
export const TOOL_KEYS: Array<keyof NonNullable<AgentenvConfig['tools']>> = [
  'ripgrep',
  'fd',
  'jq',
  'rtk',
  'ast_grep',
  'git_delta',
  'gh',
  'difftastic',
  'yq',
  'bat',
  'eza',
  'miller',
  'tokei',
  'hyperfine',
  'fzf',
  'just',
  'watchexec',
  'direnv',
  'ripgrep_all',
  'zoxide',
  'shellcheck',
  'uv',
  'xh',
  'actionlint',
  'gitleaks',
  'gum',
  'glow',
  'jless',
  'sd',
  'tealdeer',
  'duckdb',
  'qsv',
  'taplo',
  'hadolint',
  'trivy',
];

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
  // Tier 3 - new additions
  ripgrep_all: 3,
  zoxide: 3,
  shellcheck: 3,
  uv: 3,
  xh: 3,
  actionlint: 3,
  gitleaks: 3,
  gum: 3,
  glow: 3,
  jless: 3,
  sd: 3,
  tealdeer: 3,
  duckdb: 3,
  qsv: 3,
  taplo: 3,
  hadolint: 3,
  trivy: 3,
};

// Binary name mappings (TOML key -> binary name)
export const BINARY_MAP: Record<string, string> = {
  ripgrep: 'rg',
  fd: 'fd',
  jq: 'jq',
  rtk: 'rtk',
  ast_grep: 'sg',
  git_delta: 'delta',
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
  // New tools
  ripgrep_all: 'rga',
  zoxide: 'zoxide',
  shellcheck: 'shellcheck',
  uv: 'uv',
  xh: 'xh',
  actionlint: 'actionlint',
  gitleaks: 'gitleaks',
  gum: 'gum',
  glow: 'glow',
  jless: 'jless',
  sd: 'sd',
  tealdeer: 'tldr',
  duckdb: 'duckdb',
  qsv: 'qsv',
  taplo: 'taplo',
  hadolint: 'hadolint',
  trivy: 'trivy',
};

// Tool descriptions
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  ripgrep: 'Fast text search (use instead of grep -r)',
  fd: 'Fast, user-friendly file finder',
  jq: 'Lightweight and flexible command-line JSON processor',
  rtk: 'CLI proxy that reduces LLM token consumption by 60-90%',
  ast_grep: 'Structural/AST-based code search and rewrite',
  git_delta: 'Syntax-highlighted git diff pager',
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
  // New tools
  ripgrep_all: 'Fast ripgrep-based search across archives, docs, and code',
  zoxide: 'Smarter cd with fuzzy matching and learning',
  shellcheck: 'Shell script linter',
  uv: 'Fast Python package and project manager',
  xh: 'HTTP client with a curl-like interface',
  actionlint: 'GitHub Actions workflow linter',
  gitleaks: 'Secrets scan and protection (detect leaked secrets)',
  gum: 'Glow up your shell scripts with styled prompts and spinners',
  glow: 'Markdown renderer for the terminal',
  jless: 'Interactive JSON pager',
  sd: 'Intuitive find-and-replace for text files',
  tealdeer: 'Fast, community-driven man pages (tldr)',
  duckdb: 'Embeddable analytical SQL database',
  qsv: 'Ultra-fast CSV data processing toolkit',
  taplo: 'TOML linter/formatter (complements yq)',
  hadolint: 'Dockerfile linter',
  trivy: 'Vulnerability, secret, and IaC scanner',
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
      const userConfigPath = path.join(userConfigDir(), 'agentenv.toml');
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
    // Infer scope from where the file actually was, when the file itself
    // doesn't declare one — a hand-written ~/.config/agentenv/agentenv.toml
    // with no `scope = "user"` line otherwise defaults (via
    // mergeWithDefaults, from DEFAULT_CONFIG) to "project", and every caller
    // that resolves a base directory from config.scope (resolveScopeDir)
    // then writes/reads mise.toml and generated files against cwd instead of
    // the user config dir it was loaded from. An explicit `scope` in the
    // file always wins over this inference.
    if (parsed.scope === undefined) {
      const isUserScopePath =
        path.resolve(path.dirname(pathToLoad)) === path.resolve(userConfigDir());
      parsed.scope = isUserScopePath ? 'user' : 'project';
    }
    return mergeWithDefaults(normalizeConfig(parsed));
  } catch (err) {
    throw new Error(
      `Invalid agentenv configuration at ${pathToLoad}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

/**
 * Save configuration to agentenv.toml file
 */
export function saveConfig(config: AgentenvConfig, configPath: string): void {
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const result = writeFileWithVerify(configPath, configToToml(config));
    if (!result.success) throw new Error(result.message);
  } catch (err) {
    throw new Error(`Failed to save config: ${err}`, { cause: err });
  }
}

/**
 * Convert configuration object to TOML string
 */
export function configToToml(config: AgentenvConfig): string {
  const lines: string[] = [];

  // Scope
  if (config.scope) {
    lines.push(`scope = ${tomlString(config.scope)}`);
  }

  // Agents
  if (config.agents) {
    lines.push('\n[agents]');
    for (const key of AGENT_KEYS) {
      const value = config.agents[key];
      if (value !== undefined) lines.push(`${key} = ${value}`);
    }
  }

  // Tools
  if (config.tools) {
    lines.push('\n[tools]');
    for (const key of TOOL_KEYS) {
      if (config.tools[key] !== undefined) {
        lines.push(`${key} = ${config.tools[key]}`);
      }
    }
  }

  // Tool version pins
  if (config.tool_versions && Object.keys(config.tool_versions).length > 0) {
    lines.push('\n[tool_versions]');
    for (const [key, version] of Object.entries(config.tool_versions).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(`${key} = ${tomlString(version)}`);
    }
  }

  // Custom tools
  if (config.custom_tools && config.custom_tools.length > 0) {
    for (const ct of config.custom_tools) {
      lines.push('\n[[custom_tools]]');
      lines.push(`name = ${tomlString(ct.name)}`);
      lines.push(`description = ${tomlString(ct.description)}`);
      if (ct.already_installed !== undefined)
        lines.push(`already_installed = ${ct.already_installed}`);
      if (ct.mise_source) lines.push(`mise_source = ${tomlString(ct.mise_source)}`);
      if (ct.version) lines.push(`version = ${tomlString(ct.version)}`);
      if (ct.path_windows) lines.push(`path_windows = ${tomlString(ct.path_windows)}`);
      if (ct.path_macos) lines.push(`path_macos = ${tomlString(ct.path_macos)}`);
      if (ct.path_linux) lines.push(`path_linux = ${tomlString(ct.path_linux)}`);
    }
  }

  // RTK
  if (config.rtk) {
    lines.push('\n[rtk]');
    if (config.rtk.enabled !== undefined) lines.push(`enabled = ${config.rtk.enabled}`);
    if (config.rtk.init) {
      lines.push('\n[rtk.init]');
      for (const key of AGENT_KEYS) {
        const value = config.rtk.init[key];
        if (value !== undefined) lines.push(`${key} = ${value}`);
      }
    }
  }

  // Tier0
  if (config.tier0) {
    lines.push('\n[tier0]');
    if (config.tier0.check_enabled !== undefined)
      lines.push(`check_enabled = ${config.tier0.check_enabled}`);
    if (config.tier0.git_bash_path)
      lines.push(`git_bash_path = ${tomlString(config.tier0.git_bash_path)}`);
    if (config.tier0.mode !== undefined) lines.push(`mode = ${tomlString(config.tier0.mode)}`);
  }

  // Generate
  if (config.generate) {
    lines.push('\n[generate]');
    if (config.generate.marker_start)
      lines.push(`marker_start = ${tomlString(config.generate.marker_start)}`);
    if (config.generate.marker_end)
      lines.push(`marker_end = ${tomlString(config.generate.marker_end)}`);
    if (config.generate.files)
      lines.push(`files = [${config.generate.files.map(tomlString).join(', ')}]`);
  }

  // Integrations
  if (config.integrations?.superpowers) {
    const superpowers = config.integrations.superpowers;
    lines.push('\n[integrations.superpowers]');
    if (superpowers.enabled !== undefined) lines.push(`enabled = ${superpowers.enabled}`);
    if (superpowers.source) lines.push(`source = ${tomlString(superpowers.source)}`);
    if (superpowers.ref) lines.push(`ref = ${tomlString(superpowers.ref)}`);
    if (superpowers.scope) lines.push(`scope = ${tomlString(superpowers.scope)}`);
    if (superpowers.agents)
      lines.push(`agents = [${superpowers.agents.map(tomlString).join(', ')}]`);
    if (superpowers.allow_hooks !== undefined)
      lines.push(`allow_hooks = ${superpowers.allow_hooks}`);
    if (superpowers.allow_external_requests !== undefined)
      lines.push(`allow_external_requests = ${superpowers.allow_external_requests}`);
  }

  return lines.join('\n');
}

function tomlString(value: string): string {
  return JSON.stringify(value);
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
    result.agents = { ...DEFAULT_CONFIG.agents, ...config.agents };
  }

  // Merge tools (data-driven over TOOL_KEYS so a new catalog tool can never
  // be silently dropped here the way a hand-maintained per-key list would)
  if (config.tools) {
    result.tools = Object.fromEntries(
      TOOL_KEYS.map((key) => [key, config.tools?.[key] ?? DEFAULT_CONFIG.tools?.[key]]),
    ) as NonNullable<AgentenvConfig['tools']>;
  }

  // Merge custom_tools
  if (config.custom_tools) {
    result.custom_tools = config.custom_tools;
  }

  // Merge tool_versions (opt-in pins; the resulting tool list is not merged
  // into `tools`, the pins only steer the installed version).
  if (config.tool_versions) {
    result.tool_versions = config.tool_versions;
  }

  // Merge rtk
  if (config.rtk) {
    result.rtk = {
      enabled: config.rtk.enabled ?? DEFAULT_CONFIG.rtk?.enabled,
      init: Object.fromEntries(
        AGENT_KEYS.map((key) => [key, config.rtk?.init?.[key] ?? DEFAULT_CONFIG.rtk?.init?.[key]]),
      ) as NonNullable<RtkConfig['init']>,
    };
  }

  // Merge tier0
  if (config.tier0) {
    result.tier0 = {
      check_enabled: config.tier0.check_enabled ?? DEFAULT_CONFIG.tier0?.check_enabled,
      git_bash_path: config.tier0.git_bash_path ?? DEFAULT_CONFIG.tier0?.git_bash_path,
      mode: config.tier0.mode ?? DEFAULT_CONFIG.tier0?.mode,
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

  // Merge integrations
  if (config.integrations) {
    result.integrations = {
      superpowers: config.integrations.superpowers
        ? {
            enabled:
              config.integrations.superpowers.enabled ??
              DEFAULT_CONFIG.integrations?.superpowers?.enabled,
            source:
              config.integrations.superpowers.source ??
              DEFAULT_CONFIG.integrations?.superpowers?.source,
            ref:
              config.integrations.superpowers.ref ?? DEFAULT_CONFIG.integrations?.superpowers?.ref,
            scope:
              config.integrations.superpowers.scope ??
              DEFAULT_CONFIG.integrations?.superpowers?.scope,
            agents:
              config.integrations.superpowers.agents ??
              DEFAULT_CONFIG.integrations?.superpowers?.agents,
            allow_hooks:
              config.integrations.superpowers.allow_hooks ??
              DEFAULT_CONFIG.integrations?.superpowers?.allow_hooks,
            allow_external_requests:
              config.integrations.superpowers.allow_external_requests ??
              DEFAULT_CONFIG.integrations?.superpowers?.allow_external_requests,
          }
        : DEFAULT_CONFIG.integrations?.superpowers,
    };
  }

  // Merge advanced
  if (config.advanced) {
    result.advanced = {
      default_mode: config.advanced.default_mode ?? DEFAULT_CONFIG.advanced?.default_mode,
      show_diff_preview:
        config.advanced.show_diff_preview ?? DEFAULT_CONFIG.advanced?.show_diff_preview,
    };
  }

  return result;
}

/**
 * Get enabled agents from config
 */
export function getEnabledAgents(config: AgentenvConfig): string[] {
  const agents = config.agents || DEFAULT_CONFIG.agents || {};
  return AGENT_KEYS.filter((key) => agents[key] === true);
}

/**
 * Normalize a config parsed from TOML into the canonical schema shape.
 * Accepts the dotted `path.windows` / `version.windows` forms used in the
 * docs example (§6.3) and flattens them to the `path_windows` keys the rest
 * of the pipeline expects.
 */
function normalizeConfig(config: AgentenvConfig): AgentenvConfig {
  if (!Array.isArray(config.custom_tools)) {
    return config;
  }

  const normalized = {
    ...config,
    custom_tools: config.custom_tools.map((ct) => {
      const result: CustomTool = { ...ct };

      const paths = (ct as unknown as { path?: Partial<Record<string, string>> }).path;
      if (paths && typeof paths === 'object') {
        if (paths.windows) result.path_windows = paths.windows;
        if (paths.macos) result.path_macos = paths.macos;
        if (paths.linux) result.path_linux = paths.linux;
      }

      const versions = (ct as unknown as { version?: string | Record<string, string> }).version;
      if (typeof versions === 'string') {
        result.version = versions;
      } else if (versions && typeof versions === 'object' && !Array.isArray(versions)) {
        const platformKey =
          process.platform === 'win32'
            ? 'windows'
            : process.platform === 'darwin'
              ? 'macos'
              : 'linux';
        const picked = versions[platformKey] ?? versions[process.platform];
        if (picked !== undefined) result.version = picked;
      }

      return result;
    }),
  };

  return normalized;
}

/**
 * Validate a config and report problems, separating hard errors from warnings.
 * The CLI refuses to proceed when there are errors; warnings are surfaced but
 * non-fatal (e.g. a catalog tool that mise cannot install from its registry).
 */
export function validateConfig(config: AgentenvConfig): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (config.scope !== undefined && config.scope !== 'project' && config.scope !== 'user') {
    errors.push(`scope must be "project" or "user", got "${String(config.scope)}"`);
  }

  const agents = config.agents ?? {};
  for (const key of Object.keys(agents)) {
    if (!(AGENT_KEYS as readonly string[]).includes(key)) {
      errors.push(`Unknown agent "${key}"`);
    }
  }

  const tools = (config.tools ?? {}) as Record<string, boolean | undefined>;
  for (const key of Object.keys(tools)) {
    if (!(TOOL_KEYS as readonly string[]).includes(key)) {
      errors.push(`Unknown tool "${key}"`);
    }
  }

  for (const [key, value] of Object.entries(agents)) {
    if (typeof value !== 'boolean') {
      errors.push(`agents.${key} must be a boolean, got ${JSON.stringify(value)}`);
    }
  }
  for (const [key, value] of Object.entries(tools)) {
    if (typeof value !== 'boolean') {
      errors.push(`tools.${key} must be a boolean, got ${JSON.stringify(value)}`);
    }
  }

  if (config.rtk) {
    if (config.rtk.enabled !== undefined && typeof config.rtk.enabled !== 'boolean') {
      errors.push(`rtk.enabled must be a boolean, got ${JSON.stringify(config.rtk.enabled)}`);
    }
    const init = config.rtk.init ?? {};
    for (const [key, value] of Object.entries(init)) {
      if (!(AGENT_KEYS as readonly string[]).includes(key)) {
        errors.push(`rtk.init references unknown agent "${key}"`);
      } else if (typeof value !== 'boolean') {
        errors.push(`rtk.init.${key} must be a boolean, got ${JSON.stringify(value)}`);
      }
    }
  }

  if (
    config.tier0?.mode !== undefined &&
    config.tier0.mode !== 'auto' &&
    config.tier0.mode !== 'always' &&
    config.tier0.mode !== 'never'
  ) {
    errors.push(
      `tier0.mode must be "auto", "always", or "never", got "${String(config.tier0.mode)}"`,
    );
  }

  const toolVersions = config.tool_versions ?? {};
  for (const [key, version] of Object.entries(toolVersions)) {
    if (!(TOOL_KEYS as readonly string[]).includes(key)) {
      errors.push(`tool_versions references unknown tool "${key}"`);
    }
    if (typeof version !== 'string' || version.trim() === '') {
      errors.push(`tool_versions.${key} must be a non-empty version string`);
    }
  }

  if (Array.isArray(config.custom_tools)) {
    const seenNames = new Set<string>();
    for (const ct of config.custom_tools) {
      if (!ct.name) {
        errors.push('A custom tool entry is missing its "name"');
        continue;
      }
      if (seenNames.has(ct.name)) {
        errors.push(`custom tool "${ct.name}" is defined more than once`);
      }
      seenNames.add(ct.name);
      if (ct.already_installed && !ct.path_windows && !ct.path_macos && !ct.path_linux) {
        warnings.push(
          `custom tool "${ct.name}" is marked already_installed but has no OS path set`,
        );
      }
      if (!ct.already_installed && !ct.mise_source) {
        errors.push(
          `custom tool "${ct.name}" must be either already_installed with an OS path or have a mise_source`,
        );
      }
    }
  }

  // Tools Phase 0 flagged as not resolvable from the mise registry.
  const registryGapNote: Record<string, string> = {
    tokei: 'not in the mise registry; add a custom_tools fallback or local toolchain',
  };
  for (const [tool, note] of Object.entries(registryGapNote)) {
    if (tools[tool]) {
      warnings.push(`${tool}: ${note}`);
    }
  }

  const integrations = (config.integrations ?? {}) as Record<string, IntegrationConfig | undefined>;
  for (const key of Object.keys(integrations)) {
    if (!(INTEGRATION_KEYS as readonly string[]).includes(key)) {
      errors.push(`Unknown integration "${key}"`);
    }
  }

  const superpowers = config.integrations?.superpowers;
  if (superpowers) {
    if (
      superpowers.scope !== undefined &&
      superpowers.scope !== 'project' &&
      superpowers.scope !== 'user'
    ) {
      errors.push(
        `integrations.superpowers.scope must be "project" or "user", got "${String(superpowers.scope)}"`,
      );
    }
    if (superpowers.agents) {
      for (const agent of superpowers.agents) {
        if (!(AGENT_KEYS as readonly string[]).includes(agent)) {
          errors.push(`integrations.superpowers.agents contains unknown agent "${agent}"`);
        }
      }
    }
    for (const field of ['enabled', 'allow_hooks', 'allow_external_requests'] as const) {
      const value = superpowers[field];
      if (value !== undefined && typeof value !== 'boolean') {
        errors.push(
          `integrations.superpowers.${field} must be a boolean, got ${JSON.stringify(value)}`,
        );
      }
    }
    if (superpowers.source !== undefined && superpowers.source.trim() === '') {
      errors.push('integrations.superpowers.source must not be empty');
    }
    if (superpowers.ref !== undefined) {
      if (superpowers.ref.trim() === '') {
        errors.push('integrations.superpowers.ref must not be empty');
      } else if (!/^[A-Za-z0-9._/-]+$/.test(superpowers.ref)) {
        errors.push(
          `integrations.superpowers.ref "${superpowers.ref}" contains characters that are not valid in a git ref`,
        );
      } else if (['main', 'master', 'HEAD'].includes(superpowers.ref)) {
        warnings.push(
          `integrations.superpowers.ref "${superpowers.ref}" is a floating branch; pin to a tag or commit for reproducibility`,
        );
      }
    }
  }

  const generate = config.generate ?? DEFAULT_CONFIG.generate;
  if (generate) {
    if (generate.marker_start !== undefined && typeof generate.marker_start !== 'string') {
      errors.push('generate.marker_start must be a string');
    }
    if (generate.marker_end !== undefined && typeof generate.marker_end !== 'string') {
      errors.push('generate.marker_end must be a string');
    }
    if (generate.files !== undefined && !Array.isArray(generate.files)) {
      errors.push('generate.files must be an array of file names');
    } else if (generate.files) {
      for (const name of generate.files) {
        if (name !== 'AGENTS.md' && name !== 'CLAUDE.md') {
          warnings.push(
            `generate.files lists "${name}", which agentenv cannot generate (supported: AGENTS.md, CLAUDE.md)`,
          );
        }
      }
    }
  }

  return { errors, warnings };
}

export type DiffKind = 'added' | 'removed' | 'changed';

export interface ConfigDiffEntry {
  kind: DiffKind;
  key: string;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Structurally diff two configs for the pre-write review in the `setup`
 * wizard and for drift reporting in `agentenv status` (§6.5).
 * Tools/agents flip toggles as added/removed; scalar settings as changed.
 */
export function diffConfigs(
  oldConfig: AgentenvConfig,
  newConfig: AgentenvConfig,
): ConfigDiffEntry[] {
  const entries: ConfigDiffEntry[] = [];
  const oldAgents = oldConfig.agents ?? {};
  const newAgents = newConfig.agents ?? {};
  const oldTools = (oldConfig.tools ?? {}) as Record<string, boolean | undefined>;
  const newTools = (newConfig.tools ?? {}) as Record<string, boolean | undefined>;

  if (oldConfig.scope !== newConfig.scope) {
    entries.push({
      kind: 'changed',
      key: 'scope',
      oldValue: oldConfig.scope,
      newValue: newConfig.scope,
    });
  }

  for (const key of AGENT_KEYS) {
    const oldValue = oldAgents[key] === true;
    const newValue = newAgents[key] === true;
    if (oldValue !== newValue) {
      entries.push({
        kind: newValue ? 'added' : 'removed',
        key: `agents.${key}`,
        oldValue: oldValue,
        newValue: newValue,
      });
    }
  }

  for (const key of TOOL_KEYS) {
    const oldValue = oldTools[key] === true;
    const newValue = newTools[key] === true;
    if (oldValue !== newValue) {
      entries.push({
        kind: newValue ? 'added' : 'removed',
        key: `tools.${key}`,
        oldValue: oldValue,
        newValue: newValue,
      });
    }
  }

  diffCustomTools(oldConfig.custom_tools ?? [], newConfig.custom_tools ?? [], entries);

  const oldVersions = oldConfig.tool_versions ?? {};
  const newVersions = newConfig.tool_versions ?? {};
  for (const key of new Set([...Object.keys(oldVersions), ...Object.keys(newVersions)])) {
    if (oldVersions[key] !== newVersions[key]) {
      entries.push({
        kind: 'changed',
        key: `tool_versions.${key}`,
        oldValue: oldVersions[key],
        newValue: newVersions[key],
      });
    }
  }

  diffNestedSettings(
    [
      ['rtk.enabled', oldConfig.rtk?.enabled, newConfig.rtk?.enabled],
      ['rtk.init.claude_code', oldConfig.rtk?.init?.claude_code, newConfig.rtk?.init?.claude_code],
      ['rtk.init.codex_cli', oldConfig.rtk?.init?.codex_cli, newConfig.rtk?.init?.codex_cli],
      ['rtk.init.copilot', oldConfig.rtk?.init?.copilot, newConfig.rtk?.init?.copilot],
      ['rtk.init.opencode', oldConfig.rtk?.init?.opencode, newConfig.rtk?.init?.opencode],
      ['tier0.check_enabled', oldConfig.tier0?.check_enabled, newConfig.tier0?.check_enabled],
      ['tier0.git_bash_path', oldConfig.tier0?.git_bash_path, newConfig.tier0?.git_bash_path],
      ['tier0.mode', oldConfig.tier0?.mode, newConfig.tier0?.mode],
      ['generate.marker_start', oldConfig.generate?.marker_start, newConfig.generate?.marker_start],
      ['generate.marker_end', oldConfig.generate?.marker_end, newConfig.generate?.marker_end],
      ['generate.files', jsonOr(oldConfig.generate?.files), jsonOr(newConfig.generate?.files)],
      ['advanced.default_mode', oldConfig.advanced?.default_mode, newConfig.advanced?.default_mode],
      [
        'advanced.show_diff_preview',
        oldConfig.advanced?.show_diff_preview,
        newConfig.advanced?.show_diff_preview,
      ],
      [
        'integrations.superpowers.enabled',
        oldConfig.integrations?.superpowers?.enabled,
        newConfig.integrations?.superpowers?.enabled,
      ],
      [
        'integrations.superpowers.source',
        oldConfig.integrations?.superpowers?.source,
        newConfig.integrations?.superpowers?.source,
      ],
      [
        'integrations.superpowers.ref',
        oldConfig.integrations?.superpowers?.ref,
        newConfig.integrations?.superpowers?.ref,
      ],
      [
        'integrations.superpowers.scope',
        oldConfig.integrations?.superpowers?.scope,
        newConfig.integrations?.superpowers?.scope,
      ],
      [
        'integrations.superpowers.agents',
        jsonOr(oldConfig.integrations?.superpowers?.agents),
        jsonOr(newConfig.integrations?.superpowers?.agents),
      ],
      [
        'integrations.superpowers.allow_hooks',
        oldConfig.integrations?.superpowers?.allow_hooks,
        newConfig.integrations?.superpowers?.allow_hooks,
      ],
      [
        'integrations.superpowers.allow_external_requests',
        oldConfig.integrations?.superpowers?.allow_external_requests,
        newConfig.integrations?.superpowers?.allow_external_requests,
      ],
    ],
    entries,
  );

  return entries;
}

function diffCustomTools(
  oldTools: CustomTool[],
  newTools: CustomTool[],
  entries: ConfigDiffEntry[],
): void {
  const byName = (tools: CustomTool[]) =>
    new Map<string, CustomTool>(tools.map((tool) => [tool.name, tool]));

  const oldByName = byName(oldTools);
  const newByName = byName(newTools);

  for (const [name, oldTool] of oldByName) {
    if (!newByName.has(name)) {
      entries.push({ kind: 'removed', key: `custom_tools.${name}`, oldValue: oldTool });
    }
  }

  for (const [name, newTool] of newByName) {
    if (!oldByName.has(name)) {
      entries.push({ kind: 'added', key: `custom_tools.${name}`, newValue: newTool });
    }
  }

  for (const [name, oldTool] of oldByName) {
    if (!newByName.has(name)) continue;

    const newTool = newByName.get(name)!;
    const fields: Array<[string, unknown, unknown]> = [
      ['description', oldTool.description, newTool.description],
      ['already_installed', oldTool.already_installed, newTool.already_installed],
      ['mise_source', oldTool.mise_source, newTool.mise_source],
      ['version', oldTool.version, newTool.version],
      ['path_windows', oldTool.path_windows, newTool.path_windows],
      ['path_macos', oldTool.path_macos, newTool.path_macos],
      ['path_linux', oldTool.path_linux, newTool.path_linux],
    ];

    for (const [field, oldValue, newValue] of fields) {
      if (oldValue !== newValue) {
        entries.push({
          kind: 'changed',
          key: `custom_tools.${name}.${field}`,
          oldValue,
          newValue,
        });
      }
    }
  }
}

function jsonOr(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

function diffNestedSettings(
  pairs: Array<[string, unknown, unknown]>,
  entries: ConfigDiffEntry[],
): void {
  for (const [key, oldValue, newValue] of pairs) {
    if (oldValue !== newValue) {
      entries.push({ kind: 'changed', key, oldValue, newValue });
    }
  }
}

/**
 * Resolve the effective scope for an integration: its own `scope` field when
 * set, otherwise the agentenv-level scope, defaulting to "project".
 */
export function resolveIntegrationScope(
  config: AgentenvConfig,
  integration: IntegrationConfig | undefined,
): 'project' | 'user' {
  return integration?.scope ?? config.scope ?? 'project';
}
