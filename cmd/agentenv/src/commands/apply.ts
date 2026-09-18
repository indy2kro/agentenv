import { Command } from 'commander';
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
import { resolveScopeDir } from '../config/scopes.js';
import type { AgentenvConfig } from '../config/schema.js';
import { SuperpowersAdapter, integrationResultLines } from '../integrations/index.js';
import type { SuperpowersAdapterDeps } from '../integrations/index.js';
import { generateInstructionFiles, updateWithMarkers } from '../generate/agentsmd.js';
import { fixShellConfiguration } from '../shell/detector.js';
import type { RtkInitFn } from '../toolchain/rtk.js';
import {
  ensureGlobalShimsDir,
  eulaPreflightHint,
  generateMiseToml,
  isMiseInstalled,
  miseActivationHint,
  miseInstallInstructions,
  miseInstallOutcome,
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
import { renderLogo, resolveResultLine } from '../ui/output.js';
import { withSpinner } from '../ui/spinner.js';

export interface ApplyResult {
  success: boolean;
  messages: string[];
  errors: string[];
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
  /** Injectable Superpowers adapter dependencies (tests pass a claude stub). */
  superpowersDeps?: SuperpowersAdapterDeps;
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

/** Apply a validated configuration and return structured results for the CLI. */
export async function applyConfiguration(
  config: AgentenvConfig,
  baseDir: string,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
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
      return { success: false, messages, errors };
    }
    if (!options.skipPrereqMessage) {
      messages.push(prereqMessage());
    }
  }

  // Step 1 — Tier 0 shell compatibility fix.
  if (config.tier0?.check_enabled !== false) {
    const enabledAgents = getEnabledAgents(config) as AgentKey[];
    const tier0 = fixShellConfiguration(baseDir, enabledAgents, process.stdin.isTTY === true);
    (tier0.success ? messages : errors).push(`Tier 0: ${tier0.message}`);
    if (tier0.results) {
      for (const result of tier0.results) {
        messages.push(`  ${result.agent}: ${result.message}`);
      }
    }
  }

  // Step 2 — mise.toml (declares the tools).
  const enabledToolCount = Object.values(config.tools ?? {}).filter((on) => on === true).length;
  const misePath = path.join(baseDir, 'mise.toml');
  try {
    saveMiseToml(generateMiseToml(config, config.custom_tools ?? []), misePath);
    messages.push(`Tools: wrote ${misePath} (${enabledToolCount} enabled)`);
  } catch (error) {
    errors.push(
      `Unable to write ${misePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Step 3 — global shims config + trust + install + verify.
  if (errors.length === 0 && !options.skipMiseInstall) {
    const shims = ensureGlobalShimsDir();
    (shims.success ? messages : errors).push(shims.message);

    const trust = trustMiseToml(misePath, baseDir);
    (trust.success ? messages : errors).push(trust.message);

    const eulaAhead = eulaPreflightHint(config);
    if (eulaAhead) messages.push(eulaAhead);

    const install = await runMiseInstall(misePath, baseDir);
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
      const availability = verifyToolAvailability(config);
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
  for (const file of generateInstructionFiles(config, baseDir)) {
    const update = updateWithMarkers(file.path, file.content, markerStart, markerEnd);
    (update.success ? messages : errors).push(update.message);
  }

  // Step 5 - per-agent wiring.
  for (const adapter of adaptersFor(config, baseDir, options)) {
    const result = await adapter.initialize();
    if (result.success) messages.push(`${adapter.getName()}: ${result.message}`);
    else errors.push(`${adapter.getName()}: ${result.errors.join('; ') || result.message}`);
  }

  // Step 6 - optional upstream integrations (Superpowers).
  for (const adapter of enabledIntegrations(config, options)) {
    const result = await adapter.apply(baseDir, config.integrations?.superpowers);
    for (const line of integrationResultLines(result)) messages.push(`Superpowers: ${line}`);
    for (const error of result.errors) errors.push(`Superpowers: ${error}`);
  }

  return { success: errors.length === 0, messages, errors };
}

export const applyCommand = new Command()
  .name('apply')
  .description('Non-interactive: read config and generate everything')
  .option('--skip-mise-install', 'skip mise install (files only; for CI/dry-run)')
  .action(async (options: { skipMiseInstall?: boolean }) => {
    renderLogo();
    let config: AgentenvConfig;
    try {
      config = loadConfig();
    } catch (error) {
      console.error(theme.fail(error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
      return;
    }

    const report = validateConfig(config);
    for (const warning of report.warnings) console.log(theme.warn(`warning: ${warning}`));
    if (report.errors.length > 0) {
      for (const error of report.errors) console.error(theme.fail(`error: ${error}`));
      process.exitCode = 1;
      return;
    }

    const baseDir = resolveScopeDir(config.scope);
    const result = await withSpinner('Applying configuration...', () =>
      applyConfiguration(config, baseDir, {
        skipMiseInstall: options.skipMiseInstall === true,
      }),
    );
    for (const message of result.messages) console.log(colorizeLine(message));
    for (const error of result.errors) console.error(theme.fail(error));
    if (!result.success) {
      process.exitCode = 1;
      console.log(
        `\n${resolveResultLine({ severity: 'fail', headline: 'Apply failed', summary: 'fix the errors above and re-run `agentenv apply`' })}\n`,
      );
      return;
    }
    console.log(
      `\n${resolveResultLine({ severity: 'ok', headline: 'Apply complete!', summary: 'everything is configured and verified' })}\n`,
    );
  });
