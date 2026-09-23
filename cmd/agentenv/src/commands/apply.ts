import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  ClaudeCodeAdapter,
  CodexCliAdapter,
  CopilotAdapter,
  OpenCodeAdapter,
  GeminiCliAdapter,
  CursorAdapter,
  WindsurfAdapter,
  ClineAdapter,
  VibeAdapter,
} from '../adapters/index.js';
import type { BaseAdapter } from '../adapters/index.js';
import { getEnabledAgents, loadConfig, validateConfig } from '../config/schema.js';
import type { AgentKey } from '../config/schema.js';
import {
  configFilePath,
  findConfigPath,
  parseScopeFlag,
  resolveScopeDir,
} from '../config/scopes.js';
import type { ScopeValue } from '../config/scopes.js';
import type { AgentenvConfig } from '../config/schema.js';
import { SuperpowersAdapter, integrationResultLines } from '../integrations/index.js';
import type { SuperpowersAdapterDeps } from '../integrations/index.js';
import {
  generateAgentsMd,
  generateInstructionFiles,
  planMarkerUpdate,
  updateWithMarkers,
} from '../generate/agentsmd.js';
import type { GeneratedFile } from '../generate/agentsmd.js';
import {
  checkAgentShellConfiguration,
  detectShell,
  fixShellConfiguration,
} from '../shell/detector.js';
import { shellFixStatePath } from '../shell/shell-fix-state.js';
import type { RtkInitFn } from '../toolchain/rtk.js';
import { isUnsupportedRtkAgentError } from '../toolchain/rtk.js';
import {
  ensureGlobalShimsDir,
  eulaPreflightHint,
  generateMiseToml,
  isMiseInstalled,
  miseActivationHint,
  miseInstallInstructions,
  miseInstallOutcome,
  platformUnsupportedHint,
  prereqMessage,
  runMiseInstall,
  saveMiseToml,
  toolAvailabilityLine,
  trustMiseToml,
  verifyHintNeeded,
  verifySummaryLine,
  verifyToolAvailability,
} from '../toolchain/mise.js';
import { normalizeOutput } from '../utils/output.js';
import { colorizeLine, theme } from '../ui/theme.js';
import { renderLogo, setQuietEnabled } from '../ui/output.js';
import { printConfigPath, printMessages, printResult, reportValidation } from '../ui/report.js';
import { withSpinner } from '../ui/spinner.js';
import type { Spinner } from '../ui/spinner.js';

export interface ApplyResult {
  success: boolean;
  messages: string[];
  errors: string[];
  /** Wall-clock milliseconds the apply took, for the end-of-run timing line. */
  elapsedMs?: number;
}

export interface ApplyJsonResult {
  success: boolean;
  configPath: string;
  baseDir: string;
  messages: string[];
  errors: string[];
  warnings: string[];
  elapsedMs?: number;
}

/** Shape `--json` prints for a completed (non-dry-run) apply. */
export function buildApplyJsonResult(
  result: ApplyResult,
  extra: { configPath: string; baseDir: string; warnings: string[] },
): ApplyJsonResult {
  return {
    success: result.success,
    configPath: extra.configPath,
    baseDir: extra.baseDir,
    messages: result.messages,
    errors: result.errors,
    warnings: extra.warnings,
    elapsedMs: result.elapsedMs,
  };
}

export interface DryRunFileStatus {
  path: string;
  status: 'create' | 'update' | 'unchanged' | 'error';
  message?: string;
}

export interface DryRunTier0Agent {
  agent: string;
  needsFix: boolean;
}

export interface ApplyDryRunPlan {
  configPath: string;
  baseDir: string;
  misePlan: {
    miseTomlPath: string;
    enabledToolCount: number;
    status: 'create' | 'update' | 'unchanged';
  };
  generatedFiles: DryRunFileStatus[];
  agents: string[];
  rtkEnabled: boolean;
  integrations: string[];
  /** Per-agent Tier 0 shell-fix plan on Windows with Git Bash found; null everywhere else. */
  tier0: DryRunTier0Agent[] | null;
}

export interface ApplyDryRunJsonResult extends ApplyDryRunPlan {
  success: true;
  dryRun: true;
}

/**
 * Compute what `apply` would actually change, without writing anything:
 * mise.toml's and each generated file's create/update/unchanged status (via
 * planMarkerUpdate(), the same decision the real write path uses, so they
 * can never disagree about what counts as a change) and, on Windows with
 * Git Bash found, the per-agent Tier 0 shell-fix plan.
 */
export function buildApplyDryRunPlan(
  config: AgentenvConfig,
  baseDir: string,
  configPath: string,
  files: GeneratedFile[],
  agents: string[],
  integrations: Array<{ getName(): string }>,
): ApplyDryRunPlan {
  const enabledToolCount = Object.values(config.tools ?? {}).filter((on) => on === true).length;
  const miseTomlPath = path.join(baseDir, 'mise.toml');
  const miseContent = generateMiseToml(config, config.custom_tools ?? []);
  const miseStatus: 'create' | 'update' | 'unchanged' = !fs.existsSync(miseTomlPath)
    ? 'create'
    : fs.readFileSync(miseTomlPath, 'utf-8') === miseContent
      ? 'unchanged'
      : 'update';

  const markerStart = config.generate?.marker_start ?? '<!-- agentenv-managed-start -->';
  const markerEnd = config.generate?.marker_end ?? '<!-- agentenv-managed-end -->';
  const generatedFiles: DryRunFileStatus[] = files.map((file) => {
    const plan = planMarkerUpdate(file.path, file.content, markerStart, markerEnd);
    return plan.status === 'error'
      ? { path: file.path, status: 'error' as const, message: plan.message }
      : { path: file.path, status: plan.status };
  });

  let tier0: DryRunTier0Agent[] | null = null;
  if (process.platform === 'win32') {
    const shell = detectShell();
    if (shell.gitBashPath) {
      tier0 = agents.map((agent) => ({
        agent,
        needsFix: checkAgentShellConfiguration(agent as AgentKey).needsFix,
      }));
    }
  }

  return {
    configPath,
    baseDir,
    misePlan: { miseTomlPath, enabledToolCount, status: miseStatus },
    generatedFiles,
    agents,
    rtkEnabled: config.rtk?.enabled === true,
    integrations: integrations.map((integration) => integration.getName()),
    tier0,
  };
}

export interface ApplyOptions {
  /**
   * Skip ensuring/installing via mise. Used by tests and any caller that
   * only wants file generation (e.g. CI too fast, or a dry-run apply).
   */
  skipMiseInstall?: boolean;
  /**
   * Skip pushing the "Prerequisite: mise X" line. `setup` passes
   * this so the line is printed exactly once per run (its own prereq check
   * already printed it).
   */
  skipPrereqMessage?: boolean;
  /** Injectable `rtk init` runner (tests pass a stub). */
  rtkInit?: RtkInitFn;
  /**
   * Overrides config.tier0.mode for this run (e.g. the `--shell-fix` CLI
   * flag). Takes precedence over the config file when set.
   */
  tier0Mode?: 'auto' | 'always' | 'never';
  /** Injectable Superpowers adapter dependencies (tests pass a claude stub). */
  superpowersDeps?: SuperpowersAdapterDeps;
  /**
   * Optional hooks around the (slow, tens-of-seconds) mise install step, so
   * the CLI layer can show mise's own progress live instead of only seeing
   * it once applyConfiguration resolves. Left unset by every test, so
   * applyConfiguration stays presentation-free by default.
   */
  onMiseInstall?: {
    onStart?: () => void;
    onOutput?: (chunk: string, stream: 'stdout' | 'stderr') => void;
    onEnd?: () => void;
  };
}

/**
 * Whether the Tier 0 Windows shell fix should actually write files this run,
 * given its resolved mode and whether stdin is a TTY:
 *  - "auto" (the long-standing default): only with a TTY.
 *  - "always": always — this is what lets an AI agent (which never has a
 *    TTY) running `apply`/`setup --yes` still get the fix applied.
 *  - "never": never, even with a TTY.
 */
export function resolveTier0WriteFiles(mode: 'auto' | 'always' | 'never', isTTY: boolean): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return isTTY;
}

/**
 * Whether step 3 (mise install/verify) should run: only when mise.toml was
 * actually written (there'd be nothing to install otherwise) and
 * --skip-mise-install wasn't passed. Deliberately NOT gated on the
 * cumulative error count — a Tier 0 failure (step 1) is unrelated and must
 * not also skip installing every configured tool: gating this on
 * `errors.length === 0` meant one broken agent shell-fix write silently
 * skipped tool installation entirely.
 */
export function shouldRunMiseInstall(miseTomlWritten: boolean, skipMiseInstall: boolean): boolean {
  return miseTomlWritten && !skipMiseInstall;
}

function adaptersFor(
  config: AgentenvConfig,
  baseDir: string,
  options: ApplyOptions,
): BaseAdapter[] {
  const adapterConfig = {
    enabled: true,
    baseDir,
    rtkEnabled: config.rtk?.enabled === true,
    rtkInit: options.rtkInit,
  };
  const adapters: BaseAdapter[] = [];
  if (config.agents?.claude_code) adapters.push(new ClaudeCodeAdapter(adapterConfig));
  if (config.agents?.codex_cli) adapters.push(new CodexCliAdapter(adapterConfig));
  if (config.agents?.copilot) adapters.push(new CopilotAdapter(adapterConfig));
  if (config.agents?.opencode) adapters.push(new OpenCodeAdapter(adapterConfig));
  if (config.agents?.gemini_cli) adapters.push(new GeminiCliAdapter(adapterConfig));
  if (config.agents?.cursor) adapters.push(new CursorAdapter(adapterConfig));
  if (config.agents?.windsurf) adapters.push(new WindsurfAdapter(adapterConfig));
  if (config.agents?.cline) adapters.push(new ClineAdapter(adapterConfig));
  if (config.agents?.vibe) adapters.push(new VibeAdapter(adapterConfig));
  return adapters;
}

/** Integration adapters whose integration is enabled in the config (e.g. Superpowers). */
function enabledIntegrations(config: AgentenvConfig, options: ApplyOptions): SuperpowersAdapter[] {
  const adapters: SuperpowersAdapter[] = [];
  if (config.integrations?.superpowers?.enabled) {
    adapters.push(new SuperpowersAdapter(options.superpowersDeps));
  }
  return adapters;
}

/**
 * For user/global scope the instruction files are written into each enabled
 * agent's own user-level instruction file (e.g. ~/.claude/CLAUDE.md for
 * Claude Code) instead of only the baseDir copies, which no agent reads.
 * Returns the per-agent files for the scope; empty for project scope.
 */
export function userScopeInstructionFiles(
  config: AgentenvConfig,
  baseDir: string,
  options: ApplyOptions,
): GeneratedFile[] {
  if (config.scope !== 'user') return [];
  const content = generateAgentsMd(config);
  return adaptersFor(config, baseDir, options).map((adapter) => ({
    path: adapter.getUserInstructionFile(),
    content,
  }));
}

/** Apply a validated configuration and return structured results for the CLI. */
export async function applyConfiguration(
  config: AgentenvConfig,
  baseDir: string,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const startedAt = Date.now();
  const messages: string[] = [];
  const errors: string[] = [];

  // Step 0 — self-diagnose the prerequisite before touching anything, so a
  // missing mise fails loudly with install instructions instead of half
  // configuring the project.
  if (!options.skipMiseInstall) {
    if (!isMiseInstalled()) {
      errors.push('Prerequisite check failed: mise is not installed.');
      errors.push("agentenv uses mise to install and manage this project's tools.");
      errors.push(...miseInstallInstructions());
      return { success: false, messages, errors, elapsedMs: Date.now() - startedAt };
    }
    if (!options.skipPrereqMessage) {
      messages.push(prereqMessage());
    }
  }

  // Step 1 — Tier 0 shell compatibility fix.
  if (config.tier0?.check_enabled !== false) {
    const enabledAgents = getEnabledAgents(config) as AgentKey[];
    const tier0Mode = options.tier0Mode ?? config.tier0?.mode ?? 'auto';
    const writeShellFixFiles = resolveTier0WriteFiles(tier0Mode, process.stdin.isTTY === true);
    try {
      const tier0 = fixShellConfiguration(baseDir, enabledAgents, writeShellFixFiles);
      (tier0.success ? messages : errors).push(`Tier 0: ${tier0.message}`);
      if (tier0.results) {
        for (const result of tier0.results) {
          messages.push(`  ${result.agent}: ${result.message}`);
        }
      }
    } catch (error) {
      errors.push(`Tier 0: failed — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Step 2 — mise.toml (declares the tools).
  const enabledToolCount = Object.values(config.tools ?? {}).filter((on) => on === true).length;
  const misePath = path.join(baseDir, 'mise.toml');
  let miseTomlWritten = false;
  try {
    saveMiseToml(generateMiseToml(config, config.custom_tools ?? []), misePath);
    miseTomlWritten = true;
    messages.push(`Tools: wrote ${misePath} (${enabledToolCount} enabled)`);
    const platformSkip = platformUnsupportedHint(config);
    if (platformSkip) messages.push(platformSkip);
  } catch (error) {
    errors.push(
      `Unable to write ${misePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Step 3 — global shims config + trust + install + verify.
  if (shouldRunMiseInstall(miseTomlWritten, options.skipMiseInstall === true)) {
    const shims = ensureGlobalShimsDir(shellFixStatePath());
    (shims.success ? messages : errors).push(shims.message);

    const trust = trustMiseToml(misePath, baseDir);
    (trust.success ? messages : errors).push(trust.message);

    const eulaAhead = eulaPreflightHint(config);
    if (eulaAhead) messages.push(eulaAhead);

    options.onMiseInstall?.onStart?.();
    const install = await runMiseInstall(misePath, baseDir, options.onMiseInstall?.onOutput);
    options.onMiseInstall?.onEnd?.();
    if (install.success) {
      messages.push(miseInstallOutcome(install.stdout));
      if (install.eulaHint) messages.push(install.eulaHint);
    } else {
      const installDetail = normalizeOutput(install.stderr || install.stdout).trim();
      errors.push(
        `mise install failed${install.exitCode === null ? '' : ` (exit ${install.exitCode})`}: ${installDetail}${install.eulaHint ? ` ${install.eulaHint}` : ''}`,
      );
    }

    if (errors.length === 0) {
      const availability = verifyToolAvailability(config, {
        cwd: baseDir,
        miseTomlPath: misePath,
      });
      const missing = availability.filter((tool) => tool.status === 'missing');
      messages.push(verifySummaryLine(availability));
      for (const tool of availability) messages.push(`  ${toolAvailabilityLine(tool)}`);
      if (verifyHintNeeded(availability)) messages.push(miseActivationHint());
      if (missing.length > 0) {
        errors.push(
          `Tool verification failed: ${missing.length} of ${availability.length} configured tools are not installed (mise install did not produce them)`,
        );
      }
    }
  }

  // Step 4 — instruction files for the agents.
  const markerStart = config.generate?.marker_start ?? '<!-- agentenv-managed-start -->';
  const markerEnd = config.generate?.marker_end ?? '<!-- agentenv-managed-end -->';
  for (const file of [
    ...generateInstructionFiles(config, baseDir),
    ...userScopeInstructionFiles(config, baseDir, options),
  ]) {
    const update = updateWithMarkers(file.path, file.content, markerStart, markerEnd);
    (update.success ? messages : errors).push(update.message);
  }

  // Step 5 - per-agent wiring.
  for (const adapter of adaptersFor(config, baseDir, options)) {
    const result = await adapter.initialize();
    if (result.success) {
      messages.push(`${adapter.getName()}: ${result.message}`);
    } else if (
      adapter instanceof VibeAdapter &&
      isUnsupportedRtkAgentError(result.errors, 'vibe')
    ) {
      // Known upstream gap: the pinned rtk build's --agent enum doesn't
      // include "vibe" yet. Warn instead of failing the whole apply — this
      // one delegated agent just doesn't get rtk hooks configured.
      messages.push(
        `${adapter.getName()}: skipped — rtk does not yet support "vibe" as an --agent value; rtk delegation for Mistral Vibe is not configured until a newer rtk release adds it.`,
      );
    } else {
      errors.push(`${adapter.getName()}: ${result.errors.join('; ') || result.message}`);
    }
  }

  // Step 6 - optional upstream integrations (Superpowers).
  for (const adapter of enabledIntegrations(config, options)) {
    const result = await adapter.apply(baseDir, config.integrations?.superpowers);
    for (const line of integrationResultLines(result)) messages.push(`Superpowers: ${line}`);
    for (const error of result.errors) errors.push(`Superpowers: ${error}`);
  }

  return { success: errors.length === 0, messages, errors, elapsedMs: Date.now() - startedAt };
}

export const applyCommand = new Command()
  .name('apply')
  .description('Non-interactive: read config and generate everything')
  .option('--skip-mise-install', 'skip mise install (files only; for CI/dry-run)')
  .option('--dry-run', 'show what would be written without changing anything')
  .option(
    '--shell-fix <mode>',
    'Tier 0 Windows shell fix: auto (default; only writes files with a TTY) | always (write even without a TTY — for an agent running apply) | never',
  )
  .option('--scope <scope>', 'config scope to apply: project|user (default: nearest config)')
  .option('--json', 'emit a machine-readable JSON document on stdout')
  .action(
    async (
      options: {
        skipMiseInstall?: boolean;
        dryRun?: boolean;
        shellFix?: string;
        scope?: ScopeValue;
        json?: boolean;
      },
      command: Command,
    ) => {
      const startedAt = Date.now();
      const json = options.json === true;
      if (json) setQuietEnabled(true);
      renderLogo();
      const dryRun = options.dryRun === true;

      const scope = parseScopeFlag(options.scope);
      if (scope.error) {
        command.error(scope.error);
        return;
      }

      let tier0Mode: 'auto' | 'always' | 'never' | undefined;
      if (options.shellFix !== undefined) {
        if (['auto', 'always', 'never'].includes(options.shellFix)) {
          tier0Mode = options.shellFix as 'auto' | 'always' | 'never';
        } else {
          command.error(
            `invalid --shell-fix "${options.shellFix}" (expected "auto", "always", or "never")`,
          );
          return;
        }
      }

      /** Emit a single-error JSON failure document (json mode's equivalent of a themed console.error). */
      const jsonFail = (error: string): void => {
        console.log(JSON.stringify({ success: false, messages: [], errors: [error] }, null, 2));
      };

      let config: AgentenvConfig;
      let configPath: string | null;
      if (scope.scope) {
        configPath = configFilePath(scope.scope);
        if (!fs.existsSync(configPath)) {
          const error = `No agentenv.toml found at ${configPath} (scope ${scope.scope}).`;
          if (json) jsonFail(error);
          else console.error(error);
          process.exitCode = 1;
          return;
        }
      } else {
        configPath = findConfigPath() ?? null;
        if (!configPath) {
          const error = 'No agentenv.toml found. Run `agentenv setup` first.';
          if (json) jsonFail(error);
          else console.error(error);
          process.exitCode = 1;
          return;
        }
      }
      try {
        config = loadConfig(configPath, { layerUserConfig: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (json) jsonFail(message);
        else console.error(theme.fail(message));
        process.exitCode = 1;
        return;
      }
      if (!json) printConfigPath(configPath);

      const report = validateConfig(config);
      if (report.errors.length > 0) {
        if (json) {
          console.log(
            JSON.stringify(
              { success: false, messages: [], errors: report.errors, warnings: report.warnings },
              null,
              2,
            ),
          );
        } else {
          reportValidation(report, 'Configuration invalid — not applying.');
        }
        process.exitCode = 1;
        return;
      }
      if (!json) reportValidation(report, 'Configuration invalid — not applying.');

      const baseDir = resolveScopeDir(config.scope);
      if (dryRun) {
        const files = [
          ...generateInstructionFiles(config, baseDir),
          ...userScopeInstructionFiles(config, baseDir, options),
        ];
        const agents = [...getEnabledAgents(config)];
        const integrations = enabledIntegrations(config, options);
        const plan = buildApplyDryRunPlan(config, baseDir, configPath, files, agents, integrations);

        if (json) {
          const payload: ApplyDryRunJsonResult = { success: true, dryRun: true, ...plan };
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        console.log(
          `  Tools:          ${plan.misePlan.enabledToolCount} enabled -> ${plan.misePlan.miseTomlPath} [${plan.misePlan.status}]`,
        );
        console.log('  Generated files:');
        if (plan.generatedFiles.length === 0) {
          console.log('    (none)');
        } else {
          for (const file of plan.generatedFiles) {
            console.log(
              `    ${file.path} [${file.status}]${file.message ? ` — ${file.message}` : ''}`,
            );
          }
        }
        console.log(
          `  Agents:         ${agents.join(', ') || '(none)'}${config.rtk?.enabled === true ? ' (rtk rewriting on)' : ''}`,
        );
        console.log(
          `  Integrations:   ${integrations.length > 0 ? integrations.map((i) => i.getName()).join(', ') : '(none)'}`,
        );
        if (plan.tier0) {
          console.log('  Tier 0 (Windows shell fix):');
          for (const entry of plan.tier0) {
            console.log(
              `    ${entry.agent}: ${entry.needsFix ? 'needs fix' : 'already configured'}`,
            );
          }
        }
        printResult('ok', 'Dry run complete', 'no changes were made', Date.now() - startedAt);
        return;
      }

      const result = await withSpinner('Applying configuration...', (spinner: Spinner) =>
        applyConfiguration(config, baseDir, {
          skipMiseInstall: options.skipMiseInstall === true,
          tier0Mode,
          // Streamed mise install progress is human-only chrome — it would
          // otherwise interleave raw text into the JSON document.
          onMiseInstall: json
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

      if (json) {
        console.log(
          JSON.stringify(
            buildApplyJsonResult(result, { configPath, baseDir, warnings: report.warnings }),
            null,
            2,
          ),
        );
        if (!result.success) process.exitCode = 1;
        return;
      }

      printMessages(result.messages, result.errors);
      if (!result.success) {
        process.exitCode = 1;
        printResult(
          'fail',
          'Apply failed',
          'fix the errors above and re-run `agentenv apply`',
          result.elapsedMs,
        );
        return;
      }
      printResult(
        'ok',
        'Apply complete!',
        'everything is configured and verified',
        result.elapsedMs,
      );
    },
  );
