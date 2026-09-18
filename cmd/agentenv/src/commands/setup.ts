import { Command } from 'commander';
import * as fs from 'fs';
import { detectInstalledAgents } from '../adapters/detect.js';
import { loadConfig, saveConfig, validateConfig } from '../config/schema.js';
import type { AgentKey, AgentenvConfig } from '../config/schema.js';
import { configFilePath, resolveScopeDir } from '../config/scopes.js';
import { applyConfiguration } from './apply.js';
import { runConfigWizard } from './wizard.js';
import { AGENT_OPTIONS, buildDefaultSimpleConfig, parseAgentsInput } from '../wizard/build.js';
import {
  getMiseVersion,
  isMiseInstalled,
  miseInstallInstructions,
  prereqLine,
} from '../toolchain/mise.js';
import { colorizeLine, theme } from '../ui/theme.js';
import { renderLogo, resolveResultLine } from '../ui/output.js';
import { withSpinner } from '../ui/spinner.js';
import type { Spinner } from '../ui/spinner.js';

function agentLabel(agent: AgentKey): string {
  return AGENT_OPTIONS.find((option) => option.value === agent)?.label ?? agent;
}

interface MisePrereqCheckDeps {
  isInstalled?: () => boolean;
  version?: () => string;
}

/**
 * Print the one "Prerequisite: mise X" line (or fail loudly with install
 * instructions when mise is missing). Injectable so `setup --yes` tests can
 * skip a real mise subprocess while still counting the printed line.
 */
export function misePrereqCheck(deps: MisePrereqCheckDeps = {}): boolean {
  const installed = deps.isInstalled ?? isMiseInstalled;
  const version = deps.version ?? getMiseVersion;
  if (installed()) {
    console.log(`${prereqLine(version())}\n`);
    return true;
  }
  console.error(
    theme.fail('agentenv requires mise to install and manage tools, but mise was not found.'),
  );
  for (const line of miseInstallInstructions()) console.error(`  ${line}`);
  console.error('\nInstall mise first, then re-run `agentenv setup`.');
  return false;
}

export interface SaveAndApplyDeps {
  /** Injectable applyConfiguration (tests stub the apply tail). */
  applyConfiguration?: typeof applyConfiguration;
  /** Success line printed after applying (default: "Setup complete!"). */
  successMessage?: string;
}

/** Save the config and apply it, mirroring the shared setup tail. */
export async function saveAndApply(
  config: AgentenvConfig,
  file: string,
  deps: SaveAndApplyDeps = {},
): Promise<void> {
  if (fs.existsSync(file)) {
    console.log(`Note: ${file} already exists — setup is idempotent and updates it in place.\n`);
  }
  saveConfig(config, file);
  console.log(`Saved configuration: ${file}\n`);

  const apply = deps.applyConfiguration ?? applyConfiguration;
  const result = await withSpinner('Applying configuration...', (spinner: Spinner) =>
    // setup already printed the prereq line above, so tell apply not to repeat it.
    apply(config, resolveScopeDir(config.scope ?? 'project'), {
      skipPrereqMessage: true,
      onMiseInstall: {
        onStart: () => {
          spinner.stop();
          console.log(colorizeLine('Installing tools via mise...'));
        },
        onOutput: (chunk) => process.stdout.write(chunk),
        onEnd: () => spinner.start(),
      },
    }),
  );
  for (const message of result.messages) console.log(colorizeLine(message));
  for (const error of result.errors) console.error(theme.fail(error));
  if (!result.success) {
    process.exitCode = 1;
    console.log(`\n${resolveResultLine({ severity: 'fail', headline: 'Setup failed' })}\n`);
    return;
  }

  console.log(
    `\n${resolveResultLine({ severity: 'ok', headline: deps.successMessage ?? 'Setup complete!' })}\n`,
  );
}

interface SetupCommandOptions {
  yes?: boolean;
  agents?: string;
  scope?: string;
  tier2?: boolean;
  rtk?: boolean;
  config?: string;
  superpowers?: string | boolean;
}

export interface UnattendedSetupDeps extends SaveAndApplyDeps {
  misePrereqCheckDeps?: MisePrereqCheckDeps;
}

/**
 * Unattended, single-command setup: `agentenv setup --yes`. Resolves the
 * configuration from, in priority order:
 *   1. --config <path>  (an existing agentenv.toml to apply verbatim)
 *   2. An existing agentenv.toml at the target scope (idempotent re-apply)
 *   3. Defaults (detected agents + Tier 1&2 tools + rtk), overridable via
 *      --agents / --no-tier2 / --no-rtk / --scope / --superpowers.
 */
export async function unattendedSetup(
  options: SetupCommandOptions,
  deps: UnattendedSetupDeps = {},
): Promise<void> {
  renderLogo();
  if (!misePrereqCheck(deps.misePrereqCheckDeps)) {
    process.exitCode = 1;
    console.log(`\n${resolveResultLine({ severity: 'fail', headline: 'Setup failed' })}\n`);
    return;
  }

  let config: AgentenvConfig;
  let file: string;

  if (options.config) {
    try {
      config = loadConfig(options.config);
    } catch (error) {
      console.error(theme.fail(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
      return;
    }
    const report = validateConfig(config);
    for (const warning of report.warnings) console.log(theme.warn(`warning: ${warning}`));
    if (report.errors.length > 0) {
      for (const error of report.errors) console.error(theme.fail(`error: ${error}`));
      console.error(theme.fail(`Configuration at ${options.config} is invalid; not applying.`));
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
      for (const warning of report.warnings) console.log(theme.warn(`warning: ${warning}`));
      if (report.errors.length > 0) {
        for (const error of report.errors) console.error(theme.fail(`error: ${error}`));
        process.exitCode = 1;
        return;
      }
    } else {
      let agents: AgentKey[];
      if (options.agents) {
        try {
          agents = parseAgentsInput(options.agents);
        } catch (error) {
          console.error(theme.fail(error instanceof Error ? error.message : String(error)));
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
      const superpowersRef =
        options.superpowers === undefined
          ? undefined
          : typeof options.superpowers === 'string'
            ? options.superpowers
            : undefined;
      config = buildDefaultSimpleConfig(agents, includeTier2, rtkEnabled, scope, superpowersRef);
      console.log(
        `Defaults: agents ${agents.join(', ')}, Tier 2 tools ${includeTier2 ? 'on' : 'off'}, rtk ${rtkEnabled ? 'on' : 'off'}, Superpowers ${
          superpowersRef === undefined ? 'off' : `on (ref ${superpowersRef || 'default'})`
        }`,
      );
    }
  }

  await saveAndApply(config, file, deps);
}

export const setupCommand = new Command()
  .name('setup')
  .alias('configure')
  .description(
    'Setup wizard (agents, tools, custom binaries, Superpowers); use --yes for unattended single-command setup',
  )
  .option('-y, --yes', 'unattended: use detected agents + defaults, or an existing config')
  .option('-a, --agents <agents>', 'comma-separated agents to configure (unattended)')
  .option('--scope <scope>', 'configuration scope: project|user (default: project)')
  .option('--no-tier2', 'skip Tier 2 tools (unattended)')
  .option('--no-rtk', 'disable rtk command rewriting (unattended)')
  .option(
    '--superpowers [ref]',
    'enable the Superpowers integration (unattended); optional github tag/branch/commit ref',
  )
  .option('--config <path>', 'path to an existing agentenv.toml to apply (unattended)')
  .action(async (options: SetupCommandOptions) => {
    if (options.yes) {
      await unattendedSetup(options);
      return;
    }
    await runConfigWizard();
  });
