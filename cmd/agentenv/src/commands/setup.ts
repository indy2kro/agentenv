import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { detectInstalledAgents } from '../adapters/detect.js';
import { loadConfig, saveConfig, validateConfig } from '../config/schema.js';
import type { AgentKey, AgentenvConfig } from '../config/schema.js';
import { configFilePath, findConfigPath, parseScopeFlag } from '../config/scopes.js';
import type { ScopeValue } from '../config/scopes.js';
import { applyConfiguration } from './apply.js';
import type { ApplyResult } from './apply.js';
import { runConfigWizard } from './wizard.js';
import { AGENT_OPTIONS, buildDefaultSimpleConfig, parseAgentsInput } from '../wizard/build.js';
import {
  getMiseVersion,
  isMiseInstalled,
  miseInstallInstructions,
  prereqLine,
} from '../toolchain/mise.js';
import { colorizeLine, setColorEnabled, theme } from '../ui/theme.js';
import { renderLogo, setQuietEnabled } from '../ui/output.js';
import { printJson } from '../cli/json.js';
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
  /** Generate files only — no `mise install`, no verification. */
  skipMiseInstall?: boolean;
  /**
   * What to write to `file`, when it differs from the (possibly user-layered)
   * `config` being applied. `null` means the file is already what the user
   * wants: don't touch it, so its comments and layering survive.
   */
  persistConfig?: AgentenvConfig | null;
  /** JSON mode: don't stream raw mise output onto stdout (it would corrupt the document). */
  json?: boolean;
  /**
   * JSON mode: receives apply's structured result (and the config file it ran
   * against) instead of the human message list and result box being printed.
   */
  onApplied?: (result: ApplyResult, file: string) => void;
}

/**
 * The project file's own settings, for generating committed files without the
 * user layer (see ApplyOptions.fileConfig). Undefined in user scope, or when
 * the file can't be read back.
 */
function projectFileConfig(config: AgentenvConfig, file: string): AgentenvConfig | undefined {
  if (config.scope !== 'project') return undefined;
  try {
    return loadConfig(file);
  } catch {
    return undefined;
  }
}

/** Save the config and apply it, mirroring the shared setup tail. */
export async function saveAndApply(
  config: AgentenvConfig,
  file: string,
  deps: SaveAndApplyDeps = {},
): Promise<void> {
  const toSave = deps.persistConfig === undefined ? config : deps.persistConfig;
  if (toSave === null) {
    console.log(`Using existing configuration: ${file} (left unchanged)\n`);
  } else {
    const existed = fs.existsSync(file);
    const changed = saveConfig(toSave, file);
    if (!changed) console.log(`Configuration already up to date: ${file} (left unchanged)\n`);
    else if (existed) console.log(`Updated configuration: ${file}\n`);
    else console.log(`Saved configuration: ${file}\n`);
  }

  const apply = deps.applyConfiguration ?? applyConfiguration;
  // `file` is always the actual agentenv.toml being applied — including when
  // findConfigPath()'s upward search found it in an ancestor
  // directory — so its own directory is the base dir, not a re-derivation
  // from config.scope that assumes cwd for "project".
  const result = await withSpinner('Applying configuration...', (spinner: Spinner) =>
    // setup already printed the prereq line above, so tell apply not to repeat it.
    apply(config, path.dirname(file), {
      skipPrereqMessage: true,
      fileConfig: projectFileConfig(config, file),
      skipMiseInstall: deps.skipMiseInstall,
      onMiseInstall: deps.json
        ? undefined
        : {
            onStart: () => {
              spinner.stop();
              console.log(colorizeLine('Installing tools via mise...'));
            },
            onOutput: (chunk) => process.stdout.write(chunk),
            onEnd: () => spinner.start(),
          },
    }),
  );
  if (deps.json) {
    deps.onApplied?.(result, file);
    if (!result.success) process.exitCode = 1;
    return;
  }
  printMessages(result.messages, result.errors, result.timeline);
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
  json?: boolean;
}

export interface UnattendedSetupDeps extends SaveAndApplyDeps {
  misePrereqCheckDeps?: MisePrereqCheckDeps;
}

/**
 * `--agents`/`--superpowers`/`--no-rtk`/`--no-tier2` only take effect when unattendedSetup builds a
 * fresh default config; reusing an existing agentenv.toml (the common case)
 * applies it as-is, silently dropping whatever the caller typed unless we
 * say so here.
 */
function ignoredUnattendedFlags(options: SetupCommandOptions): string[] {
  const ignored: string[] = [];
  if (options.agents !== undefined) ignored.push('--agents');
  if (options.superpowers !== undefined) ignored.push('--superpowers');
  if (options.rtk === false) ignored.push('--no-rtk');
  if (options.tier2 === false) ignored.push('--no-tier2');
  return ignored;
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
  let reusedExisting = false;

  if (options.config) {
    try {
      config = loadConfig(options.config, { layerUserConfig: true });
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
    // Apply the given file in place (never copy it over cwd/agentenv.toml).
    file = path.resolve(options.config);
    reusedExisting = true;
  } else {
    const scope: ScopeValue = options.scope ?? 'project';
    file = configFilePath(scope);

    if (fs.existsSync(file)) {
      printConfigPath(file);
      try {
        config = loadConfig(file, { layerUserConfig: true });
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
      reusedExisting = true;
    } else if (options.scope === undefined) {
      // No config at the preferred scope and the user didn't ask for a
      // specific one. Re-apply the nearest existing config (project first,
      // then user) instead of silently writing a fresh project config.
      const nearest = findConfigPath();
      if (nearest) {
        printConfigPath(nearest);
        file = nearest;
        try {
          config = loadConfig(nearest, { layerUserConfig: true });
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
        reusedExisting = true;
      }
    }

    if (config === undefined) {
      let agents: AgentKey[];
      if (options.agents) {
        try {
          agents = parseAgentsInput(options.agents);
        } catch (error) {
          console.error(theme.fail(error instanceof Error ? error.message : String(error)));
          process.exitCode = 2; // usage error: unknown agent name
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
      // A bare `--superpowers` arrives as `true`: enabled, at the default ref ('').
      const superpowersRef =
        options.superpowers === undefined
          ? undefined
          : typeof options.superpowers === 'string'
            ? options.superpowers
            : '';
      config = buildDefaultSimpleConfig(agents, includeTier2, rtkEnabled, scope, superpowersRef);
      console.log(
        `Defaults: agents ${agents.join(', ')}, Tier 2 tools ${includeTier2 ? 'on' : 'off'}, rtk ${rtkEnabled ? 'on' : 'off'}, Superpowers ${
          superpowersRef === undefined ? 'off' : `on (ref ${superpowersRef || 'default'})`
        }`,
      );
    }
  }

  await saveAndApply(config, file, {
    ...deps,
    startedAt,
    ...(reusedExisting ? { persistConfig: null } : {}),
  });
}

/**
 * `setup --yes --json`: run the normal unattended flow with chrome off and
 * its console output captured, then emit one JSON envelope. Raw mise output
 * is not streamed (it would corrupt the document).
 */
export async function unattendedSetupJson(
  options: SetupCommandOptions,
  deps: UnattendedSetupDeps = {},
): Promise<void> {
  setQuietEnabled(true);
  setColorEnabled(false);
  // Notes the flow prints before/around apply, warnings (e.g. ignored flags),
  // and errors from steps that stop before apply ever runs (bad config, no
  // agents). Apply's own messages/errors come from its structured result.
  const notes: string[] = [];
  const warnings: string[] = [];
  const earlyErrors: string[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const capture = (sink: string[]) => (message?: unknown) => {
    for (const line of String(message ?? '').split(/\r?\n/)) {
      if (line.trim() !== '') sink.push(line);
    }
  };
  console.log = capture(notes);
  console.warn = capture(warnings);
  console.error = capture(earlyErrors);
  const priorExitCode = process.exitCode;
  process.exitCode = undefined;
  let applied: { result: ApplyResult; file: string } | undefined;
  try {
    await unattendedSetup(options, {
      ...deps,
      json: true,
      onApplied: (result, file) => {
        applied = { result, file };
        deps.onApplied?.(result, file);
      },
    });
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
  const failed = process.exitCode !== undefined && process.exitCode !== 0;
  printJson({
    success: !failed,
    configPath: applied?.file ?? null,
    baseDir: applied ? path.dirname(applied.file) : null,
    messages: [...notes, ...(applied?.result.messages ?? [])],
    errors: [...earlyErrors, ...(applied?.result.errors ?? [])],
    warnings,
    ...(applied?.result.elapsedMs === undefined ? {} : { elapsedMs: applied.result.elapsedMs }),
  });
  if (!failed) process.exitCode = priorExitCode;
}

export const setupCommand = new Command()
  .name('setup')
  .alias('configure')
  .description(
    'Setup wizard (agents, tools, custom binaries, Superpowers); use --yes for unattended single-command setup',
  )
  .option('-y, --yes', 'unattended: use detected agents + defaults, or an existing config')
  .option('-a, --agents <agents>', 'comma-separated agents to configure (unattended)')
  .option(
    '--scope <scope>',
    'configuration scope: project|user (default: project; preselects the wizard prompt without --yes)',
  )
  .option('--no-tier2', 'skip Tier 2 tools (unattended)')
  .option('--no-rtk', 'disable rtk command rewriting (unattended)')
  .option(
    '--superpowers [ref]',
    'enable the Superpowers integration (unattended); optional github tag/branch/commit ref',
  )
  .option('--config <path>', 'path to an existing agentenv.toml to apply (unattended)')
  .option('--json', 'emit one machine-readable JSON document on stdout (requires --yes)')
  .action(async (options: SetupCommandOptions, command: Command) => {
    const scope = parseScopeFlag(options.scope);
    if (scope.error) {
      command.error(scope.error);
      return;
    }
    if (options.json && !options.yes) {
      command.error('--json requires --yes (the interactive wizard cannot produce JSON)');
      return;
    }
    if (options.yes && options.json) {
      await unattendedSetupJson({ ...options, scope: scope.scope });
      return;
    }
    if (options.yes) {
      await unattendedSetup({ ...options, scope: scope.scope });
      return;
    }
    await runConfigWizard({ scope: scope.scope });
  });
