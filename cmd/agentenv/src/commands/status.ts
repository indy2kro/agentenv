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
  validateConfig,
} from '../config/schema.js';
import type { AgentKey, AgentenvConfig, CustomTool } from '../config/schema.js';
import { findConfigPath, resolveScopeDir } from '../config/scopes.js';
import { detectShell } from '../shell/detector.js';

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
  };

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
  .action(() => {
    console.log('\n=== agentenv status ===\n');

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
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }

    const baseDir = resolveScopeDir(config.scope);
    console.log(`Config: ${configPath}`);
    console.log(`Scope: ${config.scope ?? 'project'}`);
    console.log(`Base directory: ${baseDir}`);

    const report = validateConfig(config);
    console.log(
      `Validation: ${report.errors.length === 0 ? 'valid' : `${report.errors.length} error(s)`}${
        report.warnings.length > 0 ? `, ${report.warnings.length} warning(s)` : ''
      }`,
    );
    for (const warning of report.warnings) console.log(`  warning: ${warning}`);
    console.log(`RTK command rewriting: ${config.rtk?.enabled ? 'enabled' : 'disabled'}`);

    // Tier 0 shell status
    const shell = detectShell();
    console.log('\nTier 0 (shell):');
    if (shell.isWindows) {
      console.log(`  Windows, POSIX-compatible: ${shell.isPosixCompatible ? 'yes' : 'NO'}`);
      if (shell.gitBashPath) console.log(`  Git Bash: ${shell.gitBashPath}`);
      if (!shell.isPosixCompatible) console.log('  Fix: run `agentenv apply` (Tier 0 shell fix)');
    } else {
      console.log(
        `  ${shell.isPosixCompatible ? 'POSIX-compatible' : 'non-POSIX'} (not Windows; Tier 0 N/A)`,
      );
      const missing = shell.missingUtilities;
      if (missing.length > 0) console.log(`  Missing utilities: ${missing.join(', ')}`);
    }

    // Agents
    const enabledAgents = getEnabledAgents(config) as AgentKey[];
    console.log('\nAgents:');
    if (enabledAgents.length === 0) {
      console.log('  (none enabled)');
    }
    for (const agent of enabledAgents) {
      const meta = AGENT_CONFIG_FILES[agent];
      const installed = isAgentInstalled(agent);
      const configured = fs.existsSync(meta.check(baseDir));
      const drift = installed && !configured;
      console.log(
        `  ${meta.label.padEnd(16)} installed: ${installed ? 'yes' : 'no'}   ` +
          `configured: ${configured ? 'yes' : 'no'}${drift ? '   <- drift: installed but not configured' : ''}`,
      );
    }

    // Tools
    const enabledTools = TOOL_KEYS.filter((key) => config.tools?.[key] === true);
    console.log('\nTools:');
    for (const key of enabledTools) {
      const binary = BINARY_MAP[key];
      const found = resolveBinary(binary) !== null;
      const tier = TOOL_TIERS[key] ?? '?';
      const desc = TOOL_DESCRIPTIONS[key] ?? '';
      console.log(
        `  ${found ? '✓' : '✗'} ${binary.padEnd(12)} ${key} (Tier ${tier})${found ? '' : '   <- drift: enabled in config but not on PATH'} — ${desc}`,
      );
    }
    if (enabledTools.length === 0) console.log('  (none enabled)');

    // Custom tools
    const customTools = config.custom_tools ?? [];
    console.log('\nCustom tools:');
    if (customTools.length === 0) {
      console.log('  (none)');
    }
    for (const tool of customTools) {
      console.log(`  ${tool.name}: ${customToolStatus(tool)}`);
    }

    // Generated files
    console.log('\nGenerated files:');
    const generated: Array<[string, string, boolean]> = [
      ['mise.toml', path.join(baseDir, 'mise.toml'), false],
      ['AGENTS.md', path.join(baseDir, 'AGENTS.md'), true],
      ['CLAUDE.md', path.join(baseDir, 'CLAUDE.md'), true],
    ];
    for (const [label, file, markerCheck] of generated) {
      const exists = fs.existsSync(file);
      if (!exists) {
        console.log(`  ✗ ${label} (missing)`);
        continue;
      }
      const managed = markerCheck ? containsManagedMarker(file, config) : true;
      console.log(`  ✓ ${label}${managed ? '' : ' (managed marker block missing)'}`);
    }

    console.log('\n=== Status complete ===\n');
  });
