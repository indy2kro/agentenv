import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { isAgentInstalled, resolveBinary } from '../adapters/detect.js';
import {
  BINARY_MAP,
  TOOL_DESCRIPTIONS,
  TOOL_KEYS,
  TOOL_TIERS,
  getEnabledAgents,
  loadConfig,
  resolveIntegrationScope,
  validateConfig,
} from '../config/schema.js';
import type { AgentKey, AgentenvConfig, CustomTool } from '../config/schema.js';
import { findConfigPath, resolveScopeDir, userConfigDir } from '../config/scopes.js';
import { checkAgentShellConfiguration, detectShell } from '../shell/detector.js';
import type { ShellInfo } from '../shell/detector.js';
import { SuperpowersAdapter, ghAuthLine } from '../integrations/index.js';
import type { IntegrationResult, IntegrationState } from '../integrations/base.js';
import { resolveGhAuthProbe } from '../toolchain/gh.js';
import {
  MISE_TOOL_NAMES,
  PINNED_TOOL_VERSIONS,
  getInstalledToolState,
  getMiseVersion,
  shimExists,
  toolAvailabilityClassification,
} from '../toolchain/mise.js';
import type { ToolResolvability } from '../toolchain/mise.js';
import { colorizeLine, theme } from '../ui/theme.js';
import { renderLogo, resolveResultLine, setQuietEnabled } from '../ui/output.js';
import type { ResultBoxContent } from '../ui/output.js';

const AGENT_CONFIG_FILES: Record<AgentKey, { label: string; check: (baseDir: string) => string }> =
  {
    claude_code: {
      label: 'Claude Code',
      check: () => path.join(homeDir(), '.claude', 'settings.json'),
    },
    // These are written by `rtk init` in the project dir / global plugin dir.
    codex_cli: { label: 'Codex CLI', check: (baseDir) => path.join(baseDir, 'RTK.md') },
    copilot: {
      label: 'GitHub Copilot',
      check: (baseDir) => path.join(baseDir, '.github', 'copilot-instructions.md'),
    },
    opencode: {
      label: 'OpenCode',
      check: () => path.join(homeDir(), '.config', 'opencode', 'plugins', 'rtk.ts'),
    },
    gemini_cli: { label: 'Gemini CLI', check: (baseDir) => path.join(baseDir, 'RTK.md') },
    cursor: { label: 'Cursor', check: (baseDir) => path.join(baseDir, 'RTK.md') },
    windsurf: { label: 'Windsurf', check: (baseDir) => path.join(baseDir, 'RTK.md') },
    cline: { label: 'Cline CLI', check: (baseDir) => path.join(baseDir, 'RTK.md') },
    vibe: { label: 'Mistral Vibe', check: (baseDir) => path.join(baseDir, 'RTK.md') },
  };

export { AGENT_CONFIG_FILES };

export interface StatusAgent {
  key: string;
  label: string;
  installed: boolean;
  configured: boolean;
  drift: boolean;
}
export interface StatusTool {
  key: string;
  binary: string;
  tier: number;
  found: boolean;
  /** `resolvable` | `needs-new-terminal` | `manual` | `missing` — the same verdict apply's verify step uses, so a tool apply deliberately skips is never drift here. */
  status: ToolResolvability;
  drift: boolean;
  /** Resolved explicit pin (`tool_versions` or agentenv's internal pin), or `null` for `latest`. */
  pinned: string | null;
  /** Best-match installed version from `mise ls --json`, or `null` when moot/unknown. */
  installed: string | null;
}
export interface StatusCustomTool {
  name: string;
  status: string;
  drift: boolean;
}
export interface StatusGenerated {
  label: string;
  exists: boolean;
  managed: boolean;
}
export interface StatusIntegrationAgent {
  agent: string;
  state: IntegrationState;
  detail: string | null;
}
export interface StatusIntegration {
  key: string;
  enabled: boolean;
  source: string | null;
  ref: string | null;
  scope: string | null;
  agents: string[];
  states: StatusIntegrationAgent[];
  drift: boolean;
}

export interface StatusJson {
  command: 'status';
  config: string | null;
  scope: 'project' | 'user' | null;
  baseDir: string | null;
  exitCode: 0 | 1;
  validation: { errors: string[]; warnings: string[] };
  agents: StatusAgent[];
  tools: StatusTool[];
  customTools: StatusCustomTool[];
  generated: StatusGenerated[];
  integrations: StatusIntegration[];
}

/** Human-only fields that never appear in `--json`. */
export interface StatusReport extends StatusJson {
  rtkEnabled: boolean;
  tier0: Tier0Report | null;
  ghAuth: string | null;
  /** Resolved `mise --version` (or 'unknown') for human/bug-report context. */
  miseVersion: string;
  /**
   * Per-integration lines the human renderer prints but `StatusJson` does not
   * carry (the spec-pinned status JSON has no hooks/external/warning fields).
   */
  integrationDetails: StatusIntegrationDetail[];
}

export interface StatusIntegrationDetail {
  key: string;
  hooksAllowed: boolean | null;
  externalRequestsAllowed: boolean | null;
  warnings: string[];
}

export interface Tier0Report {
  isWindows: boolean;
  currentShell: string;
  gitBashPath: string | null;
  posixCompatible: boolean;
  missingUtilities: string[];
  agentChecks: Array<{ agent: string; label: string; needsFix: boolean }>;
  needsFix: boolean;
}

export function computeStatusExitCode(report: StatusJson): 0 | 1 {
  const drifted =
    report.config === null ||
    report.validation.errors.length > 0 ||
    report.tools.some((tool) => tool.drift) ||
    report.agents.some((agent) => agent.drift) ||
    report.generated.some((entry) => !entry.exists || !entry.managed) ||
    report.integrations.some((integration) => integration.drift) ||
    report.customTools.some((tool) => tool.drift);
  return drifted ? 1 : 0;
}

export interface StatusDeps {
  findConfigPath?: typeof findConfigPath;
  loadConfig?: typeof loadConfig;
  resolveScopeDir?: typeof resolveScopeDir;
  validateConfig?: typeof validateConfig;
  getMiseVersion?: typeof getMiseVersion;
  getInstalledToolState?: typeof getInstalledToolState;
  getEnabledAgents?: typeof getEnabledAgents;
  isAgentInstalled?: typeof isAgentInstalled;
  resolveBinary?: typeof resolveBinary;
  shimExists?: typeof shimExists;
  detectShell?: typeof detectShell;
  checkAgentShellConfiguration?: typeof checkAgentShellConfiguration;
  fileExists?: (file: string) => boolean;
  hasManagedMarker?: (file: string, config: AgentenvConfig) => boolean;
  resolveGhAuthProbe?: typeof resolveGhAuthProbe;
  superpowersStatus?: (
    baseDir: string,
    config: NonNullable<AgentenvConfig['integrations']>['superpowers'],
  ) => Promise<IntegrationResult>;
}

const defaultSuperpowersStatus: NonNullable<StatusDeps['superpowersStatus']> = async (
  baseDir,
  config,
) => {
  const adapter = new SuperpowersAdapter();
  return adapter.status(baseDir, config);
};

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function scopeFromConfigPath(configPath: string): 'project' | 'user' {
  return norm(configPath) === norm(path.join(userConfigDir(), 'agentenv.toml'))
    ? 'user'
    : 'project';
}

function hasManagedMarker(file: string, config: AgentenvConfig): boolean {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const marker = config.generate?.marker_start ?? '<!-- agentenv-managed-start -->';
    return content.includes(marker);
  } catch {
    return false;
  }
}

function customToolPath(tool: CustomTool): string | undefined {
  if (process.platform === 'win32') return tool.path_windows;
  if (process.platform === 'darwin') return tool.path_macos;
  return tool.path_linux;
}

function customToolStatus(
  tool: CustomTool,
  exists: (file: string) => boolean,
): { status: string; drift: boolean } {
  if (tool.already_installed) {
    const candidate = customToolPath(tool);
    const pathExists = candidate !== undefined && exists(candidate);
    return {
      status: candidate && pathExists ? `present (${candidate})` : 'MISSING on disk',
      drift: !pathExists,
    };
  }
  return {
    status: `mise source: ${tool.mise_source}${tool.version ? ` (${tool.version})` : ''}`,
    drift: false,
  };
}

function tier0Report(shell: ShellInfo, enabledAgents: AgentKey[], deps: StatusDeps): Tier0Report {
  const isWindows = shell.isWindows;
  const shellHome = homeDir();
  const agentChecks =
    isWindows === true
      ? enabledAgents.map((agent) => ({
          agent,
          label: AGENT_CONFIG_FILES[agent]?.label ?? agent,
          needsFix: (deps.checkAgentShellConfiguration ?? checkAgentShellConfiguration)(
            agent,
            shellHome,
          ).needsFix,
        }))
      : [];
  return {
    isWindows,
    currentShell: shell.currentShell,
    gitBashPath: shell.gitBashPath ?? null,
    posixCompatible: shell.isPosixCompatible,
    missingUtilities: shell.missingUtilities,
    agentChecks,
    needsFix: isWindows && (!shell.gitBashPath || agentChecks.some((check) => check.needsFix)),
  };
}

/** Gather the full status report (structured, no printing). */
export async function gatherStatus(deps: StatusDeps = {}): Promise<StatusReport> {
  const getMiseVersionFn = deps.getMiseVersion ?? getMiseVersion;
  const configPath = (deps.findConfigPath ?? findConfigPath)();
  if (!configPath) {
    const report: StatusReport = {
      command: 'status',
      config: null,
      scope: null,
      baseDir: null,
      exitCode: 0,
      validation: { errors: [], warnings: [] },
      agents: [],
      tools: [],
      customTools: [],
      generated: [],
      integrations: [],
      rtkEnabled: false,
      tier0: null,
      ghAuth: null,
      miseVersion: getMiseVersionFn(),
      integrationDetails: [],
    };
    return { ...report, exitCode: computeStatusExitCode(report) };
  }

  let config: AgentenvConfig;
  try {
    config = (deps.loadConfig ?? loadConfig)(configPath);
  } catch (error) {
    const scope = scopeFromConfigPath(configPath);
    const report: StatusReport = {
      command: 'status',
      config: configPath,
      scope,
      baseDir: (deps.resolveScopeDir ?? resolveScopeDir)(scope),
      exitCode: 0,
      validation: {
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      },
      agents: [],
      tools: [],
      customTools: [],
      generated: [],
      integrations: [],
      rtkEnabled: false,
      tier0: null,
      ghAuth: null,
      miseVersion: getMiseVersionFn(),
      integrationDetails: [],
    };
    return { ...report, exitCode: computeStatusExitCode(report) };
  }

  const resolveDir = deps.resolveScopeDir ?? resolveScopeDir;
  const baseDir = resolveDir(config.scope);
  const validation = (deps.validateConfig ?? validateConfig)(config);
  const shell = (deps.detectShell ?? detectShell)();
  const enabledAgents = (deps.getEnabledAgents ?? getEnabledAgents)(config) as AgentKey[];
  const exists = deps.fileExists ?? fs.existsSync;
  const rtkEnabled = config.rtk?.enabled === true;

  const agents: StatusAgent[] = enabledAgents.map((agent) => {
    const meta = AGENT_CONFIG_FILES[agent];
    const installed = (deps.isAgentInstalled ?? isAgentInstalled)(agent);
    const configured = exists(meta.check(baseDir));
    return {
      key: agent,
      label: meta.label,
      installed,
      configured,
      drift: installed && !configured,
    };
  });

  const enabledTools = TOOL_KEYS.filter((key) => config.tools?.[key] === true);
  let ghAuth: string | null = null;
  const installedState = (deps.getInstalledToolState ?? getInstalledToolState)();
  const hasVersionData = Object.keys(installedState).length > 0;
  const tools: StatusTool[] = enabledTools.map((key) => {
    const binary = BINARY_MAP[key];
    const resolution = toolAvailabilityClassification(
      key,
      binary,
      installedState,
      deps.resolveBinary,
      deps.shimExists,
    );
    const found = resolution === 'resolvable';
    if (key === 'gh' && found) {
      ghAuth = ghAuthLine((deps.resolveGhAuthProbe ?? resolveGhAuthProbe)()().status);
    }
    const miseName = MISE_TOOL_NAMES[key] || key;
    const state = installedState[miseName];
    const pinned = config.tool_versions?.[key] ?? PINNED_TOOL_VERSIONS[miseName] ?? null;
    const installedVersions = state?.versions ?? [];
    const installed =
      hasVersionData && installedVersions.length > 0
        ? installedVersions[installedVersions.length - 1]
        : null;
    const versionDrift =
      pinned !== null &&
      installed !== null &&
      installedVersions.length > 0 &&
      !installedVersions.includes(pinned);
    return {
      key,
      binary,
      tier: TOOL_TIERS[key] ?? 0,
      found,
      status: resolution,
      drift: resolution === 'missing' || versionDrift,
      pinned,
      installed,
    };
  });

  const customTools: StatusCustomTool[] = (config.custom_tools ?? []).map((tool) => {
    const { status, drift } = customToolStatus(tool, exists);
    return { name: tool.name, status, drift };
  });

  const generatedEntries: Array<[string, string, boolean]> = [
    ['mise.toml', path.join(baseDir, 'mise.toml'), false],
    ['AGENTS.md', path.join(baseDir, 'AGENTS.md'), true],
    ['CLAUDE.md', path.join(baseDir, 'CLAUDE.md'), true],
  ];
  const generated: StatusGenerated[] = generatedEntries.map(([label, file, markerCheck]) => {
    const generatedExists = exists(file);
    const managed =
      generatedExists &&
      (markerCheck ? (deps.hasManagedMarker ?? hasManagedMarker)(file, config) : true);
    return { label, exists: generatedExists, managed };
  });

  const integrations: StatusIntegration[] = [];
  const integrationDetails: StatusIntegrationDetail[] = [];
  const integrationKey = 'superpowers';
  const superpowersConfig = config.integrations?.superpowers;
  if (superpowersConfig?.enabled === true) {
    // Resolve against the top-level scope before calling the adapter — the
    // adapter only ever sees an IntegrationConfig, not the full
    // AgentenvConfig, so it can't fall back to the top-level scope itself
    // (see the matching resolution in apply.ts).
    const scope = resolveIntegrationScope(config, superpowersConfig);
    const result = await (deps.superpowersStatus ?? defaultSuperpowersStatus)(resolveDir(scope), {
      ...superpowersConfig,
      scope,
    });
    integrations.push({
      key: integrationKey,
      enabled: true,
      source: result.source ?? null,
      ref: result.ref ?? null,
      scope: result.scope,
      agents: superpowersConfig.agents ?? [],
      states: result.agents.map(({ agent, state, detail }) => ({
        agent,
        state,
        detail: detail ?? null,
      })),
      drift: result.agents.some((entry) => entry.state === 'missing' || entry.state === 'drifted'),
    });
    integrationDetails.push({
      key: integrationKey,
      hooksAllowed: superpowersConfig.allow_hooks ?? false,
      externalRequestsAllowed: superpowersConfig.allow_external_requests ?? false,
      warnings: result.warnings,
    });
  } else {
    integrations.push({
      key: integrationKey,
      enabled: false,
      source: null,
      ref: null,
      scope: null,
      agents: [],
      states: [],
      drift: false,
    });
    integrationDetails.push({
      key: integrationKey,
      hooksAllowed: null,
      externalRequestsAllowed: null,
      warnings: [],
    });
  }

  const report: StatusReport = {
    command: 'status',
    config: configPath,
    scope: config.scope ?? 'project',
    baseDir,
    exitCode: 0,
    validation,
    agents,
    tools,
    customTools,
    generated,
    integrations,
    rtkEnabled,
    tier0: tier0Report(shell, enabledAgents, deps),
    ghAuth,
    miseVersion: getMiseVersionFn(),
    integrationDetails,
  };

  return { ...report, exitCode: computeStatusExitCode(report) };
}

function statusSummary(report: StatusReport): ResultBoxContent {
  if (report.config === null) {
    return {
      severity: 'fail',
      headline: 'No configuration found',
      summary: 'run `agentenv setup` or `agentenv apply` to get started',
    };
  }
  const issues =
    report.validation.errors.length +
    report.tools.filter((tool) => tool.drift).length +
    report.agents.filter((agent) => agent.drift).length +
    report.customTools.filter((tool) => tool.drift).length +
    report.generated.filter((entry) => !entry.exists || !entry.managed).length +
    report.integrations.filter((integration) => integration.drift).length;
  if (issues === 0) {
    return { severity: 'ok', headline: 'Environment is clean' };
  }
  return {
    severity: 'fail',
    headline: `Status: ${issues} issue${issues === 1 ? '' : 's'} found`,
    summary: 'run `agentenv apply` to fix, or `agentenv update` for new versions',
  };
}

export function statusToJson(report: StatusReport): StatusJson {
  return {
    command: report.command,
    config: report.config,
    scope: report.scope,
    baseDir: report.baseDir,
    exitCode: report.exitCode,
    validation: report.validation,
    agents: report.agents,
    tools: report.tools,
    customTools: report.customTools,
    generated: report.generated,
    integrations: report.integrations,
  };
}

function displayName(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Collapsed one-line-per-area view for `status --short`. */
export function renderStatusShort(report: StatusReport): string {
  const chunks: string[] = [];
  chunks.push(`Config: ${report.config ?? '(none)'}`);
  if (report.config !== null) {
    chunks.push(`Scope: ${report.scope ?? 'project'}`);
    chunks.push(`Base directory: ${report.baseDir}`);
  }

  const toolDrift = report.tools.filter((tool) => tool.drift).length;
  chunks.push(
    `Tools: ${report.tools.length} configured${toolDrift > 0 ? `, ${toolDrift} drifted` : ''}`,
  );
  const agentDrift = report.agents.filter((agent) => agent.drift).length;
  chunks.push(
    `Agents: ${report.agents.length} enabled${agentDrift > 0 ? `, ${agentDrift} drifted` : ''}`,
  );
  if (report.customTools.length > 0) {
    const customDrift = report.customTools.filter((tool) => tool.drift).length;
    chunks.push(
      `Custom tools: ${report.customTools.length}${customDrift > 0 ? `, ${customDrift} drifted` : ''}`,
    );
  }
  const generatedMissing = report.generated.filter(
    (entry) => !entry.exists || !entry.managed,
  ).length;
  chunks.push(
    `Generated files: ${report.generated.length}${generatedMissing > 0 ? `, ${generatedMissing} missing/unmanaged` : ''}`,
  );
  if (report.integrations.length > 0) {
    const integrationDrift = report.integrations.filter((integration) => integration.drift).length;
    chunks.push(
      `Integrations: ${report.integrations.length}${integrationDrift > 0 ? `, ${integrationDrift} drifted` : ''}`,
    );
  }
  if (report.validation.errors.length > 0) {
    chunks.push(`Config errors: ${report.validation.errors.length}`);
  }
  if (report.validation.warnings.length > 0) {
    chunks.push(`Warnings: ${report.validation.warnings.length}`);
  }
  for (const warning of report.validation.warnings)
    chunks.push(theme.warn(`  warning: ${warning}`));
  return `${chunks.join('\n')}\n`;
}

/** Render the human report body (banners are emitted by the command). */
export function renderStatus(report: StatusReport): string {
  if (report.config === null) {
    return [
      'No agentenv.toml found (project or user scope).',
      '  Run `agentenv setup` (alias: `configure`) to create one.',
      '',
    ].join('\n');
  }

  const chunks: string[] = [];

  chunks.push(`Config: ${report.config}`);
  chunks.push(`Scope: ${report.scope ?? 'project'}`);
  chunks.push(`Base directory: ${report.baseDir}`);
  chunks.push(`Mise: ${report.miseVersion}`);

  const validationSummary = `Validation: ${
    report.validation.errors.length === 0 ? 'valid' : `${report.validation.errors.length} error(s)`
  }${report.validation.warnings.length > 0 ? `, ${report.validation.warnings.length} warning(s)` : ''}`;
  chunks.push(
    report.validation.errors.length === 0
      ? theme.ok(validationSummary)
      : theme.fail(validationSummary),
  );
  for (const warning of report.validation.warnings)
    chunks.push(theme.warn(`  warning: ${warning}`));
  chunks.push(`RTK command rewriting: ${report.rtkEnabled ? 'enabled' : 'disabled'}`);

  // Tier 0 shell status
  if (report.tier0) {
    chunks.push(theme.heading('\nTier 0 (shell):'));
    const tier0 = report.tier0;
    if (tier0.isWindows) {
      chunks.push(`  Current shell: ${tier0.currentShell}`);
      if (tier0.gitBashPath) chunks.push(`  Git Bash: ${tier0.gitBashPath}`);
      else chunks.push('  Git Bash: NOT FOUND');

      if (tier0.agentChecks.length > 0) {
        chunks.push('  Agent shell overrides:');
        for (const check of tier0.agentChecks) {
          chunks.push(colorizeLine(`    ${check.needsFix ? '✗' : '✓'} ${check.label}`));
        }
      }
      if (tier0.needsFix) {
        chunks.push(theme.warn('  Fix: run `agentenv apply` (Tier 0 shell fix)'));
      }
      if (tier0.missingUtilities.length > 0) {
        chunks.push(theme.warn(`  Missing utilities: ${tier0.missingUtilities.join(', ')}`));
      }
    } else {
      chunks.push(
        `  ${tier0.posixCompatible ? 'POSIX-compatible' : 'non-POSIX'} (not Windows; Tier 0 N/A)`,
      );
    }
  }

  // Agents
  chunks.push(theme.heading('\nAgents:'));
  if (report.agents.length === 0) {
    chunks.push('  (none enabled)');
  }
  for (const agent of report.agents) {
    const line =
      `  ${agent.label.padEnd(16)} installed: ${(agent.installed ? 'yes' : 'no').padEnd(3)}   ` +
      `configured: ${agent.configured ? 'yes' : 'no'}${agent.drift ? '   <- drift: installed but not configured' : ''}`;
    chunks.push(agent.drift ? theme.warn(line) : line);
  }

  // Tools
  chunks.push(theme.heading('\nTools:'));
  for (const tool of report.tools) {
    const desc = TOOL_DESCRIPTIONS[tool.key] ?? '';
    const versionTail = !tool.found
      ? ''
      : tool.pinned !== null
        ? tool.installed !== null && tool.installed !== tool.pinned
          ? `   <- drift: version ${tool.pinned} configured, ${tool.installed} installed`
          : ` (${tool.pinned} installed)`
        : tool.installed !== null
          ? ` (${tool.installed})`
          : '';
    let marker: string;
    let tail: string;
    switch (tool.status) {
      case 'needs-new-terminal':
        marker = '~';
        tail = '   <- installed; open a new terminal';
        break;
      case 'manual':
        marker = '-';
        tail = '   <- not managed by mise; install manually';
        break;
      case 'missing':
        marker = '✗';
        tail = '   <- drift: enabled in config but not on PATH';
        break;
      default:
        marker = '✓';
        tail = versionTail;
        break;
    }
    chunks.push(
      colorizeLine(
        `  ${marker} ${tool.binary.padEnd(12)} ${tool.key} (Tier ${tool.tier})${tail} — ${desc}`,
      ),
    );
    if (tool.key === 'gh' && report.ghAuth) {
      chunks.push(colorizeLine(`      ${report.ghAuth}`));
    }
  }
  if (report.tools.length === 0) chunks.push('  (none enabled)');

  // Custom tools
  chunks.push(theme.heading('\nCustom tools:'));
  if (report.customTools.length === 0) {
    chunks.push('  (none)');
  }
  for (const tool of report.customTools) {
    chunks.push(`  ${tool.name}: ${tool.status}`);
  }

  // Generated files
  chunks.push(theme.heading('\nGenerated files:'));
  for (const entry of report.generated) {
    if (!entry.exists) {
      chunks.push(theme.fail(`  ✗ ${entry.label} (missing)`));
      continue;
    }
    chunks.push(
      colorizeLine(`  ✓ ${entry.label}${entry.managed ? '' : ' (managed marker block missing)'}`),
    );
  }

  // Integrations
  chunks.push(theme.heading('\nIntegrations:'));
  for (const integration of report.integrations) {
    chunks.push(`  ${displayName(integration.key)}`);
    if (!integration.enabled) {
      chunks.push('    enabled: no');
      continue;
    }
    chunks.push('    enabled: yes');
    chunks.push(`    source: ${integration.source ?? '(unset)'}`);
    chunks.push(`    ref: ${integration.ref ?? '(unset)'}`);
    chunks.push(`    scope: ${integration.scope}`);
    for (const agentState of integration.states) {
      const label = AGENT_CONFIG_FILES[agentState.agent as AgentKey]?.label ?? agentState.agent;
      chunks.push(
        `    ${label.padEnd(16)} ${agentState.state}${agentState.detail ? ` (${agentState.detail})` : ''}`,
      );
    }
    const details = report.integrationDetails.find((detail) => detail.key === integration.key);
    chunks.push(`    hooks allowed: ${details?.hooksAllowed ? 'yes' : 'no'}`);
    chunks.push(
      `    external requests allowed: ${details?.externalRequestsAllowed ? 'yes' : 'no'}`,
    );
    for (const warning of details?.warnings ?? []) {
      chunks.push(theme.warn(`    warning: ${warning}`));
    }
  }

  return chunks.join('\n') + '\n';
}

export const statusCommand = new Command()
  .name('status')
  .description('Show current configuration and environment status')
  .option('--json', 'emit a machine-readable JSON document on stdout')
  .option('--short', 'collapsed one-line-per-area report (no per-item detail)')
  .action(async (options: { json?: boolean; short?: boolean }) => {
    const json = options.json === true;
    const short = options.short === true;
    if (json) setQuietEnabled(true);

    renderLogo();
    const report = await gatherStatus();

    if (json) {
      console.log(JSON.stringify(statusToJson(report), null, 2));
    } else {
      process.stdout.write(short ? renderStatusShort(report) : renderStatus(report));
      const summary = statusSummary(report);
      console.log(resolveResultLine(summary));
    }

    if (report.exitCode === 1) process.exitCode = 1;
  });
