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
import { findConfigPath, resolveScopeDir } from '../config/scopes.js';
import { checkAgentShellConfiguration, detectShell } from '../shell/detector.js';
import { SuperpowersAdapter, ghAuthLine } from '../integrations/index.js';
import { resolveGhAuthProbe } from '../toolchain/gh.js';
import { colorizeLine, theme } from '../ui/theme.js';

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

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}

function containsManagedMarker(file: string, config: AgentenvConfig): boolean {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const marker = config.generate?.marker_start ?? '<!-- agentenv-managed-start -->';
    return content.includes(marker);
  } catch {
    return false;
  }
}

function customToolStatus(tool: CustomTool): string {
  if (tool.already_installed) {
    const candidate = pathForPlatform(tool);
    if (candidate && fs.existsSync(candidate)) return `present (${candidate})`;
    return 'MISSING on disk';
  }
  return `mise source: ${tool.mise_source}${tool.version ? ` (${tool.version})` : ''}`;
}

function pathForPlatform(tool: CustomTool): string | undefined {
  if (process.platform === 'win32') return tool.path_windows;
  if (process.platform === 'darwin') return tool.path_macos;
  return tool.path_linux;
}

export const statusCommand = new Command()
  .name('status')
  .description('Show current configuration and environment status')
  .action(async () => {
    console.log(theme.heading('\n=== agentenv status ===\n'));

    const configPath = findConfigPath();
    if (!configPath) {
      console.log('No agentenv.toml found (project or user scope).');
      console.log('  Run `agentenv setup` or `agentenv configure` to create one.\n');
      process.exitCode = 1;
      return;
    }

    let config: AgentenvConfig;
    try {
      config = loadConfig();
    } catch (error) {
      console.error(theme.fail(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
      return;
    }

    const baseDir = resolveScopeDir(config.scope);
    console.log(`Config: ${configPath}`);
    console.log(`Scope: ${config.scope ?? 'project'}`);
    console.log(`Base directory: ${baseDir}`);

    const report = validateConfig(config);
    const validationSummary = `Validation: ${
      report.errors.length === 0 ? 'valid' : `${report.errors.length} error(s)`
    }${report.warnings.length > 0 ? `, ${report.warnings.length} warning(s)` : ''}`;
    console.log(
      report.errors.length === 0 ? theme.ok(validationSummary) : theme.fail(validationSummary),
    );
    for (const warning of report.warnings) console.log(theme.warn(`  warning: ${warning}`));
    console.log(`RTK command rewriting: ${config.rtk?.enabled ? 'enabled' : 'disabled'}`);

    // Tier 0 shell status
    const shell = detectShell();
    console.log(theme.heading('\nTier 0 (shell):'));
    if (shell.isWindows) {
      // shell.isPosixCompatible reflects THIS interactive shell (PowerShell,
      // almost always not bash) — that's expected and isn't what `apply`
      // fixes. What apply actually manages is each enabled agent's own
      // config pointing at Git Bash, so that's what decides whether a fix
      // is actually needed.
      console.log(`  Current shell: ${shell.currentShell}`);
      if (shell.gitBashPath) console.log(`  Git Bash: ${shell.gitBashPath}`);
      else console.log('  Git Bash: NOT FOUND');

      const shellHome = process.env.HOME || process.env.USERPROFILE || '';
      const agentShellChecks = (getEnabledAgents(config) as AgentKey[]).map((agent) => ({
        agent,
        check: checkAgentShellConfiguration(agent, shellHome),
      }));
      if (agentShellChecks.length > 0) {
        console.log('  Agent shell overrides:');
        for (const { agent, check } of agentShellChecks) {
          const label = AGENT_CONFIG_FILES[agent]?.label ?? agent;
          console.log(colorizeLine(`    ${check.needsFix ? '✗' : '✓'} ${label}`));
        }
      }
      if (!shell.gitBashPath || agentShellChecks.some(({ check }) => check.needsFix)) {
        console.log(theme.warn('  Fix: run `agentenv apply` (Tier 0 shell fix)'));
      }
    } else {
      console.log(
        `  ${shell.isPosixCompatible ? 'POSIX-compatible' : 'non-POSIX'} (not Windows; Tier 0 N/A)`,
      );
      const missing = shell.missingUtilities;
      if (missing.length > 0) console.log(`  Missing utilities: ${missing.join(', ')}`);
    }

    // Agents
    const enabledAgents = getEnabledAgents(config) as AgentKey[];
    console.log(theme.heading('\nAgents:'));
    if (enabledAgents.length === 0) {
      console.log('  (none enabled)');
    }
    for (const agent of enabledAgents) {
      const meta = AGENT_CONFIG_FILES[agent];
      const installed = isAgentInstalled(agent);
      const configured = fs.existsSync(meta.check(baseDir));
      const drift = installed && !configured;
      const line =
        `  ${meta.label.padEnd(16)} installed: ${installed ? 'yes' : 'no'}   ` +
        `configured: ${configured ? 'yes' : 'no'}${drift ? '   <- drift: installed but not configured' : ''}`;
      console.log(drift ? theme.warn(line) : line);
    }

    // Tools
    const enabledTools = TOOL_KEYS.filter((key) => config.tools?.[key] === true);
    console.log(theme.heading('\nTools:'));
    for (const key of enabledTools) {
      const binary = BINARY_MAP[key];
      const found = resolveBinary(binary) !== null;
      const tier = TOOL_TIERS[key] ?? '?';
      const desc = TOOL_DESCRIPTIONS[key] ?? '';
      console.log(
        colorizeLine(
          `  ${found ? '✓' : '✗'} ${binary.padEnd(12)} ${key} (Tier ${tier})${found ? '' : '   <- drift: enabled in config but not on PATH'} — ${desc}`,
        ),
      );
      if (key === 'gh' && found) {
        console.log(colorizeLine(`      ${ghAuthLine(resolveGhAuthProbe()().status)}`));
      }
    }
    if (enabledTools.length === 0) console.log('  (none enabled)');

    // Custom tools
    const customTools = config.custom_tools ?? [];
    console.log(theme.heading('\nCustom tools:'));
    if (customTools.length === 0) {
      console.log('  (none)');
    }
    for (const tool of customTools) {
      console.log(`  ${tool.name}: ${customToolStatus(tool)}`);
    }

    // Generated files
    console.log(theme.heading('\nGenerated files:'));
    const generated: Array<[string, string, boolean]> = [
      ['mise.toml', path.join(baseDir, 'mise.toml'), false],
      ['AGENTS.md', path.join(baseDir, 'AGENTS.md'), true],
      ['CLAUDE.md', path.join(baseDir, 'CLAUDE.md'), true],
    ];
    for (const [label, file, markerCheck] of generated) {
      const exists = fs.existsSync(file);
      if (!exists) {
        console.log(theme.fail(`  ✗ ${label} (missing)`));
        continue;
      }
      const managed = markerCheck ? containsManagedMarker(file, config) : true;
      console.log(colorizeLine(`  ✓ ${label}${managed ? '' : ' (managed marker block missing)'}`));
    }

    // Integrations
    console.log(theme.heading('\nIntegrations:'));
    const superpowersConfig = config.integrations?.superpowers;
    console.log('  Superpowers');
    if (!superpowersConfig || superpowersConfig.enabled !== true) {
      console.log('    enabled: no');
    } else {
      // Resolve against the top-level scope before calling the adapter — the
      // adapter only ever sees an IntegrationConfig, not the full
      // AgentenvConfig, so it can't fall back to the top-level scope itself
      // (see the matching resolution in apply.ts).
      const scope = resolveIntegrationScope(config, superpowersConfig);
      const adapter = new SuperpowersAdapter();
      const result = await adapter.status(resolveScopeDir(scope), { ...superpowersConfig, scope });
      console.log('    enabled: yes');
      console.log(`    source: ${result.source ?? '(unset)'}`);
      console.log(`    ref: ${result.ref ?? '(unset)'}`);
      console.log(`    scope: ${result.scope}`);
      for (const agentState of result.agents) {
        const label = AGENT_CONFIG_FILES[agentState.agent]?.label ?? agentState.agent;
        console.log(
          `    ${label.padEnd(16)} ${agentState.state}${agentState.detail ? ` (${agentState.detail})` : ''}`,
        );
      }
      console.log(`    hooks allowed: ${superpowersConfig.allow_hooks ? 'yes' : 'no'}`);
      console.log(
        `    external requests allowed: ${superpowersConfig.allow_external_requests ? 'yes' : 'no'}`,
      );
      for (const warning of result.warnings) console.log(theme.warn(`    warning: ${warning}`));
    }

    console.log(theme.heading('\n=== Status complete ===\n'));
  });
