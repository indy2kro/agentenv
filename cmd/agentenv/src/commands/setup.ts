import { Command } from 'commander';
import * as fs from 'fs';
import { detectInstalledAgents } from '../adapters/detect.js';
import { loadConfig, saveConfig, validateConfig } from '../config/schema.js';
import type { AgentKey, AgentenvConfig } from '../config/schema.js';
import {
  configFilePath,
  findConfigPath,
  parseScopeFlag,
  resolveScopeDir,
} from '../config/scopes.js';
import type { ScopeValue } from '../config/scopes.js';
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
import { renderLogo } from '../ui/output.js';
import { printConfigPath, printMessages, printResult, reportValidation } from '../ui/report.js';
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
  /** Epoch ms the whole command started, for the end-of-run timing line. */
  startedAt?: number;
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
  printMessages(result.messages, result.errors);
  const elapsedMs = deps.startedAt === undefined ? result.elapsedMs : Date.now() - deps.startedAt;
  if (!result.success) {
    process.exitCode = 1;
    printResult('fail', 'Setup failed', undefined, elapsedMs);
    return;
  }

  printResult('ok', deps.successMessage ?? 'Setup complete!', undefined, elapsedMs);
}

interface SetupCommandOptions {
  yes?: boolean;
  agents?: string;
  scope?: ScopeValue;
  tier2?: boolean;
  rtk?: boolean;
  config?: string;
  superpowers?: string | boolean;
}

export interface UnattendedSetupDeps extends SaveAndApplyDeps {
  misePrereqCheckDeps?: MisePrereqCheckDeps;
}

/**
 * `--agents`/`--superpowers` only take effect when unattendedSetup builds a
 * fresh default config; reusing an existing agentenv.toml (the common case)
 * applies it as-is, silently dropping whatever the caller typed unless we
 * say so here.
 */
function ignoredUnattendedFlags(options: SetupCommandOptions): string[] {
  const ignored: string[] = [];
  if (options.agents !== undefined) ignored.push('--agents');
  if (options.superpowers !== undefined) ignored.push('--superpowers');
  return ignored;
}

/** --scope only steers unattended (--yes) setup; the interactive wizard has no scope prompt yet. */
export function interactiveScopeIgnoredWarning(scope: ScopeValue | undefined): string | undefined {
  if (scope === undefined) return undefined;
  return (
    `--scope is ignored by the interactive wizard (only --yes uses it); ` +
    `run \`agentenv setup --yes --scope ${scope}\` for unattended setup at that scope.`
  );
}

function warnIgnoredFlags(options: SetupCommandOptions, file: string): void {
  const ignored = ignoredUnattendedFlags(options);
  if (ignored.length === 0) return;
  console.warn(
    theme.warn(
      `Note: reusing the existing config at ${file}; ignoring ${ignored.join(', ')} ` +
        `(edit the file directly to change ${ignored.length === 1 ? 'it' : 'them'}).`,
    ),
  );
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
  const startedAt = Date.now();
  renderLogo();
  if (!misePrereqCheck(deps.misePrereqCheckDeps)) {
    process.exitCode = 1;
    printResult('fail', 'Setup failed', undefined, Date.now() - startedAt);
    return;
  }

  let config: AgentenvConfig | undefined;
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
    printConfigPath(options.config);
    if (!reportValidation(report, 'Configuration invalid — not applying.')) {
      process.exitCode = 1;
      return;
    }
    file = configFilePath(config.scope ?? 'project');
  } else {
    const scope: ScopeValue = options.scope ?? 'project';
    file = configFilePath(scope);

    if (fs.existsSync(file)) {
      printConfigPath(file);
      try {
        config = loadConfig(file);
      } catch (error) {
        console.error(theme.fail(error instanceof Error ? error.message : String(error)));
        process.exitCode = 1;
        return;
      }
      const report = validateConfig(config);
      if (!reportValidation(report, 'Configuration invalid — not applying.')) {
        process.exitCode = 1;
        return;
      }
      warnIgnoredFlags(options, file);
    } else if (options.scope === undefined) {
      // No config at the preferred scope and the user didn't ask for a
      // specific one. Re-apply the nearest existing config (project first,
      // then user) instead of silently writing a fresh project config.
      const nearest = findConfigPath();
      if (nearest) {
        printConfigPath(nearest);
        file = nearest;
        try {
          config = loadConfig(nearest);
        } catch (error) {
          console.error(theme.fail(error instanceof Error ? error.message : String(error)));
          process.exitCode = 1;
          return;
        }
        const report = validateConfig(config);
        if (!reportValidation(report, 'Configuration invalid — not applying.')) {
          process.exitCode = 1;
          return;
        }
        warnIgnoredFlags(options, file);
      }
    }

    if (config === undefined) {
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

  await saveAndApply(config, file, { ...deps, startedAt });
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
  .action(async (options: SetupCommandOptions, command: Command) => {
    const scope = parseScopeFlag(options.scope);
    if (scope.error) {
      command.error(scope.error);
      return;
    }
    if (options.yes) {
      await unattendedSetup({ ...options, scope: scope.scope });
      return;
    }
    const scopeWarning = interactiveScopeIgnoredWarning(scope.scope);
    if (scopeWarning) console.warn(theme.warn(scopeWarning));
    await runConfigWizard();
  });
