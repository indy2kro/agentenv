import { Command } from 'commander';
import { checkbox, confirm, select } from '@inquirer/prompts';
import * as fs from 'fs';
import { detectInstalledAgents } from '../adapters/detect.js';
import { DEFAULT_CONFIG, loadConfig, saveConfig, validateConfig } from '../config/schema.js';
import type { AgentKey, AgentenvConfig } from '../config/schema.js';
import { configFilePath, resolveScopeDir } from '../config/scopes.js';
import { applyConfiguration } from './apply.js';
import {
  AGENT_OPTIONS,
  buildConfigFromSelections,
  buildDefaultSimpleConfig,
  parseAgentsInput,
  simpleToolSelection,
} from '../wizard/build.js';
import { getMiseVersion, isMiseInstalled, miseInstallInstructions } from '../toolchain/mise.js';

function agentLabel(agent: AgentKey): string {
  return AGENT_OPTIONS.find((option) => option.value === agent)?.label ?? agent;
}

function misePrereqCheck(): boolean {
  if (isMiseInstalled()) {
    console.log(`Prerequisite: mise ${getMiseVersion()}\n`);
    return true;
  }
  console.error('agentenv requires mise to install and manage tools, but mise was not found.');
  for (const line of miseInstallInstructions()) console.error(`  ${line}`);
  console.error('\nInstall mise first, then re-run `agentenv setup`.');
  return false;
}

/** Save the config and apply it, mirroring the shared setup tail. */
async function saveAndApply(config: AgentenvConfig, file: string): Promise<void> {
  if (fs.existsSync(file)) {
    console.log(`Note: ${file} already exists — setup is idempotent and updates it in place.\n`);
  }
  saveConfig(config, file);
  console.log(`Saved configuration: ${file}\n`);

  const result = await applyConfiguration(config, resolveScopeDir(config.scope ?? 'project'));
  for (const message of result.messages) console.log(message);
  for (const error of result.errors) console.error(error);
  if (!result.success) {
    process.exitCode = 1;
    return;
  }

  console.log('\nSetup complete!\n');
}

interface SetupCommandOptions {
  yes?: boolean;
  agents?: string;
  scope?: string;
  tier2?: boolean;
  rtk?: boolean;
  config?: string;
}

/**
 * Unattended, single-command setup: `agentenv setup --yes`. Resolves the
 * configuration from, in priority order:
 *   1. --config <path>  (an existing agentenv.toml to apply verbatim)
 *   2. An existing agentenv.toml at the target scope (idempotent re-apply)
 *   3. Defaults (detected agents + Tier 1&2 tools + rtk), overridable via
 *      --agents / --no-tier2 / --no-rtk / --scope.
 */
async function unattendedSetup(options: SetupCommandOptions): Promise<void> {
  console.log('\n=== agentenv Setup (Unattended) ===\n');
  if (!misePrereqCheck()) {
    process.exitCode = 1;
    return;
  }

  let config: AgentenvConfig;
  let file: string;

  if (options.config) {
    try {
      config = loadConfig(options.config);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
      return;
    }
    const report = validateConfig(config);
    for (const warning of report.warnings) console.log(`warning: ${warning}`);
    if (report.errors.length > 0) {
      for (const error of report.errors) console.error(`error: ${error}`);
      console.error(`Configuration at ${options.config} is invalid; not applying.`);
      process.exitCode = 1;
      return;
    }
    file = configFilePath(config.scope ?? 'project');
  } else {
    const scope: 'project' | 'user' = options.scope === 'user' ? 'user' : 'project';
    file = configFilePath(scope);

    if (fs.existsSync(file)) {
      console.log(`Using existing configuration: ${file}`);
      config = loadConfig(file);
      const report = validateConfig(config);
      for (const warning of report.warnings) console.log(`warning: ${warning}`);
      if (report.errors.length > 0) {
        for (const error of report.errors) console.error(`error: ${error}`);
        process.exitCode = 1;
        return;
      }
    } else {
      let agents: AgentKey[];
      if (options.agents) {
        try {
          agents = parseAgentsInput(options.agents);
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
          return;
        }
      } else {
        agents = detectInstalledAgents();
        console.log(`Detected agents: ${agents.map(agentLabel).join(', ') || '(none)'}`);
      }
      if (agents.length === 0) {
        console.error(
          'No agents to configure. Pass --agents claude_code,codex_cli,copilot,opencode (or similar).',
        );
        process.exitCode = 1;
        return;
      }

      const includeTier2 = options.tier2 !== false;
      const rtkEnabled = options.rtk !== false;
      config = buildDefaultSimpleConfig(agents, includeTier2, rtkEnabled, scope);
      console.log(
        `Defaults: agents ${agents.join(', ')}, Tier 2 tools ${includeTier2 ? 'on' : 'off'}, rtk ${rtkEnabled ? 'on' : 'off'}`,
      );
    }
  }

  await saveAndApply(config, file);
}

export const setupCommand = new Command()
  .name('setup')
  .description(
    'Interactive setup wizard (Simple mode); use --yes for unattended single-command setup',
  )
  .option('-y, --yes', 'unattended: use detected agents + defaults, or an existing config')
  .option('-a, --agents <agents>', 'comma-separated agents to configure (unattended)')
  .option('--scope <scope>', 'configuration scope: project|user (default: project)')
  .option('--no-tier2', 'skip Tier 2 tools (unattended)')
  .option('--no-rtk', 'disable rtk command rewriting (unattended)')
  .option('--config <path>', 'path to an existing agentenv.toml to apply (unattended)')
  .action(async (options: SetupCommandOptions) => {
    if (options.yes) {
      await unattendedSetup(options);
      return;
    }

    console.log('\n=== agentenv Setup (Simple Mode) ===\n');

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error(
        'Setup is interactive; in a non-TTY run `agentenv setup --yes` or `agentenv apply`.',
      );
      process.exitCode = 1;
      return;
    }

    if (!misePrereqCheck()) {
      process.exitCode = 1;
      return;
    }

    const detected = detectInstalledAgents();
    console.log(
      detected.length > 0
        ? `Detected agents: ${detected.map(agentLabel).join(', ')}`
        : 'No agents detected on PATH (you can still select agents to configure)',
    );

    const selectedAgents = (await checkbox({
      message: 'Select agents to configure:',
      choices: AGENT_OPTIONS.map((agent) => ({
        name: agent.label,
        value: agent.value,
        checked: detected.includes(agent.value),
      })),
    })) as AgentKey[];

    if (selectedAgents.length === 0) {
      console.log('No agents selected; nothing to configure.');
      process.exitCode = 1;
      return;
    }

    const installTier2 = await confirm({
      message: 'Install Tier 2 tools (AI-coding value-add: ast-grep, git-delta, gh, difftastic)?',
      default: true,
    });

    const scope = (await select({
      message: 'Where should the configuration live?',
      choices: [
        { name: `Project-level (this repo: ${process.cwd()})`, value: 'project' },
        { name: 'User/global-level', value: 'user' },
      ],
    })) as 'project' | 'user';

    let existing: AgentenvConfig;
    try {
      existing = loadConfig();
    } catch {
      existing = DEFAULT_CONFIG;
    }

    const config = buildConfigFromSelections({
      agents: selectedAgents,
      tools: simpleToolSelection(installTier2),
      customTools: [],
      scope,
      rtkEnabled: true,
      integrations: existing.integrations,
    });

    await saveAndApply(config, configFilePath(scope));
  });
