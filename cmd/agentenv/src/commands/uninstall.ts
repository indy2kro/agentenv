import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { confirm } from '@inquirer/prompts';
import {
  AGENT_KEYS,
  BINARY_MAP,
  getEnabledAgents,
  loadConfig,
  validateConfig,
  type AgentenvConfig,
  type AgentKey,
} from '../config/schema.js';
import {
  configFilePath,
  findConfigPath,
  parseScopeFlag,
  resolveScopeDir,
} from '../config/scopes.js';
import type { ScopeValue } from '../config/scopes.js';
import { ADAPTER_CLASSES } from '../adapters/index.js';
import {
  generateInstructionFiles,
  planMarkerRemoval,
  removeMarkerBlock,
} from '../generate/agentsmd.js';
import type { MarkerRemovalPlan } from '../generate/agentsmd.js';
import {
  getToolsToInstall,
  isMiseInstalled,
  miseInstallInstructions,
  parseInstalledToolState,
  runMiseCaptured,
  runMiseUninstall,
  type InstalledToolState,
} from '../toolchain/mise.js';
import { normalizeOutput } from '../utils/output.js';
import { renderLogo, setQuietEnabled } from '../ui/output.js';
import { printConfigPath, printResult, reportValidation } from '../ui/report.js';

export interface UninstallTarget {
  /** agentenv TOML key (the custom tool's name for custom tools). */
  key: string;
  /** mise registry name passed to `mise uninstall`. */
  miseName: string;
  /** BINARY_MAP[key] ?? key — defined for custom tools too. */
  binary: string;
}

/**
 * The uninstall parity set for apply: enabled non-fallback `[tools]` entries
 * (via getToolsToInstall) plus `[[custom_tools]]` entries that carry a
 * `mise_source`. Fallback-required tools are never mise-installed and are
 * therefore never uninstall targets. Deduplicated by miseName.
 */
export function calculateUninstallTargets(config: AgentenvConfig): UninstallTarget[] {
  const targets: UninstallTarget[] = [];
  const seen = new Set<string>();
  for (const tool of getToolsToInstall(config)) {
    if (seen.has(tool.miseName)) continue;
    seen.add(tool.miseName);
    targets.push({
      key: tool.name,
      miseName: tool.miseName,
      binary: BINARY_MAP[tool.name] ?? tool.name,
    });
  }
  for (const custom of config.custom_tools ?? []) {
    if (!custom.mise_source || seen.has(custom.mise_source)) continue;
    seen.add(custom.mise_source);
    targets.push({ key: custom.name, miseName: custom.mise_source, binary: custom.name });
  }
  return targets;
}

/**
 * Match CLI tool arguments against targets by agentenv key, binary name, or
 * mise name. Any argument matching nothing lands in `unknown` (the command
 * then aborts without acting). Duplicate matches are returned once.
 */
export function resolveToolArgs(
  args: string[],
  targets: UninstallTarget[],
): { matched: UninstallTarget[]; unknown: string[] } {
  const matched: UninstallTarget[] = [];
  const unknown: string[] = [];
  for (const arg of args) {
    const hit = targets.find(
      (target) => target.key === arg || target.binary === arg || target.miseName === arg,
    );
    if (hit) {
      if (!matched.includes(hit)) matched.push(hit);
    } else {
      unknown.push(arg);
    }
  }
  return { matched, unknown };
}

export interface UninstallPlan {
  toUninstall: string[];
  alreadyGone: string[];
}

/**
 * Live installed-state read that fails closed: a failed or unrecognized
 * `mise ls --json` is an error (returns null), never treated as "nothing
 * installed". Callers must set exit code 1 on null.
 */
function readInstalledState(): Record<string, InstalledToolState> | null {
  const ls = runMiseCaptured(['ls', '--json']);
  if (ls.status !== 0) {
    console.error(
      `mise ls --json failed (exit ${ls.status ?? 'null'}): ${normalizeOutput(ls.stderr || ls.stdout).trim()}`,
    );
    return null;
  }
  const state = parseInstalledToolState(ls.stdout);
  if (state === null) {
    console.error(
      'mise ls --json returned unrecognized output (not a JSON object or array of tools).',
    );
    return null;
  }
  return state;
}

/** Plan from a live installed-state map: installed ⇒ toUninstall, else alreadyGone. */
export function uninstallPlan(
  targets: UninstallTarget[],
  installedState: Record<string, InstalledToolState>,
): UninstallPlan {
  const toUninstall: string[] = [];
  const alreadyGone: string[] = [];
  for (const target of targets) {
    if (installedState[target.miseName]?.installed) toUninstall.push(target.miseName);
    else alreadyGone.push(target.miseName);
  }
  return { toUninstall, alreadyGone };
}

/**
 * Human lines for `--dry-run` (mode 'preview') or after a real uninstall
 * (mode 'result'). With stateUnknown=true (mise absent) every target renders
 * as "state unknown (mise not installed)" and the plan is ignored.
 */
export function renderUninstallSummary(
  targets: UninstallTarget[],
  plan: UninstallPlan,
  mode: 'preview' | 'result' = 'result',
  stateUnknown = false,
): string[] {
  if (stateUnknown) {
    return targets.map((t) => `  ${t.key} (${t.binary}) — state unknown (mise not installed)`);
  }
  const byName = new Map(targets.map((target) => [target.miseName, target]));
  const label = (name: string): string => {
    const target = byName.get(name);
    return target ? `${target.key} (${target.binary})` : name;
  };
  const marker = mode === 'preview' ? 'would uninstall' : 'removed';
  return [
    ...plan.toUninstall.map((name) => `  ${label(name)} — ${marker}`),
    ...plan.alreadyGone.map((name) => `  ${label(name)} — already gone`),
  ];
}

/**
 * Parse a comma-separated `--unwire-agents` value into valid AgentKeys.
 * Unlike wizard/build.ts's parseAgentsInput(), unknown names are reported
 * back for the caller's own usage-error path instead of throwing, matching
 * resolveToolArgs()'s style elsewhere in this file.
 */
export function parseAgentList(raw: string): { agents: AgentKey[]; unknown: string[] } {
  const agents: AgentKey[] = [];
  const unknown: string[] = [];
  const seen = new Set<AgentKey>();
  for (const part of raw.split(',')) {
    const name = part.trim();
    if (!name) continue;
    const key = AGENT_KEYS.find((candidate) => candidate === name);
    if (!key) {
      unknown.push(name);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      agents.push(key);
    }
  }
  return { agents, unknown };
}

export interface UnwireFileStatus {
  path: string;
  status: MarkerRemovalPlan['status'];
  message?: string;
}

export interface UnwirePlan {
  agents: AgentKey[];
  /** true when unwiring every currently-enabled agent (no specific agents named). */
  fullUnwire: boolean;
  markerStart: string;
  markerEnd: string;
  /** Per-agent user-scope instruction files (only populated for scope 'user'). */
  agentFiles: UnwireFileStatus[];
  /** Shared project/user instruction files; only touched on a full unwire. */
  sharedFiles: UnwireFileStatus[];
  /** The generated mise.toml; only populated when a full unwire also requested its deletion. */
  miseToml: { path: string; exists: boolean } | null;
}

function classifyRemoval(filePath: string, plan: MarkerRemovalPlan): UnwireFileStatus {
  return plan.status === 'error'
    ? { path: filePath, status: 'error', message: plan.message }
    : { path: filePath, status: plan.status };
}

/**
 * Plan what `--unwire-agents` would do, without changing anything: which
 * per-agent user-scope instruction files and (on a full unwire) shared
 * instruction files hold a removable managed block, and whether mise.toml
 * would be deleted. Shared, agent-independent files (AGENTS.md/CLAUDE.md,
 * mise.toml) are only ever touched on a full unwire — a partial unwire of
 * one agent must not strip content the remaining agents still need.
 */
export function buildUnwirePlan(
  config: AgentenvConfig,
  baseDir: string,
  scope: ScopeValue,
  agents: AgentKey[],
  fullUnwire: boolean,
  deleteMiseToml: boolean,
): UnwirePlan {
  const markerStart = config.generate?.marker_start ?? '<!-- agentenv-managed-start -->';
  const markerEnd = config.generate?.marker_end ?? '<!-- agentenv-managed-end -->';

  const agentFiles: UnwireFileStatus[] =
    scope === 'user'
      ? agents.map((agent) => {
          const adapter = new ADAPTER_CLASSES[agent]({ enabled: true, baseDir });
          const filePath = adapter.getUserInstructionFile();
          return classifyRemoval(filePath, planMarkerRemoval(filePath, markerStart, markerEnd));
        })
      : [];

  const sharedFiles: UnwireFileStatus[] = fullUnwire
    ? generateInstructionFiles(config, baseDir).map((file) =>
        classifyRemoval(file.path, planMarkerRemoval(file.path, markerStart, markerEnd)),
      )
    : [];

  const miseTomlPath = path.join(baseDir, 'mise.toml');
  const miseToml =
    fullUnwire && deleteMiseToml
      ? { path: miseTomlPath, exists: fs.existsSync(miseTomlPath) }
      : null;

  return { agents, fullUnwire, markerStart, markerEnd, agentFiles, sharedFiles, miseToml };
}

export interface UnwireResult {
  success: boolean;
  messages: string[];
  errors: string[];
}

/**
 * Execute an unwire plan: adapter cleanup() per targeted agent, then remove
 * the managed block from each planned file, then delete mise.toml if
 * planned. Files are re-read fresh via removeMarkerBlock() rather than
 * trusting the plan's precomputed status, matching apply's dry-run/execute
 * split (FEAT-06) — the plan is a preview, never a cached write.
 */
export async function executeUnwire(baseDir: string, plan: UnwirePlan): Promise<UnwireResult> {
  const messages: string[] = [];
  const errors: string[] = [];

  for (const agent of plan.agents) {
    const adapter = new ADAPTER_CLASSES[agent]({ enabled: true, baseDir });
    const result = await adapter.cleanup();
    messages.push(`${adapter.getName()}: ${result.message}`);
    errors.push(...result.errors);
  }

  for (const file of [...plan.agentFiles, ...plan.sharedFiles]) {
    const result = removeMarkerBlock(file.path, plan.markerStart, plan.markerEnd);
    (result.success ? messages : errors).push(result.message);
  }

  if (plan.miseToml) {
    if (fs.existsSync(plan.miseToml.path)) {
      try {
        fs.unlinkSync(plan.miseToml.path);
        messages.push(`Deleted ${plan.miseToml.path}`);
      } catch (err) {
        errors.push(
          `Failed to delete ${plan.miseToml.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      messages.push(`${plan.miseToml.path} does not exist; nothing to delete`);
    }
  }

  return { success: errors.length === 0, messages, errors };
}

interface UninstallCommandOptions {
  tools?: string[];
  yes?: boolean;
  dryRun?: boolean;
  scope?: ScopeValue;
  json?: boolean;
  /** `true` (no value) unwires every enabled agent; a string is a comma-separated subset. */
  unwireAgents?: true | string;
  /** Also delete the generated mise.toml. Only valid on a full unwire (no specific agents named). */
  deleteMiseToml?: boolean;
  /**
   * The commander Command instance, when called from the real CLI action —
   * used so an unknown tool argument goes through the same command.error()
   * usage-error path (exit 2) as --scope, instead of exit 1. Tests calling
   * doUninstall() directly may omit it and still get exit 2.
   */
  command?: Command;
}

export interface UninstallJsonResult {
  success: boolean;
  message: string;
  configPath?: string;
  dryRun?: boolean;
  toUninstall?: string[];
  alreadyGone?: string[];
  unwiredAgents?: string[];
  filesChanged?: string[];
  deletedMiseToml?: boolean;
}

function printUninstallJson(payload: UninstallJsonResult): void {
  console.log(JSON.stringify(payload, null, 2));
}

const filesChangedFrom = (plan: UnwirePlan): string[] =>
  [...plan.agentFiles, ...plan.sharedFiles]
    .filter((f) => f.status === 'delete' || f.status === 'strip')
    .map((f) => f.path);

/**
 * The `--unwire-agents` path (FEAT-03): calls each targeted agent's
 * `cleanup()`, removes the agentenv-managed block from its user-scope
 * instruction file, and — on a full unwire (no specific agents named) —
 * also strips the shared project/user AGENTS.md/CLAUDE.md and, with
 * `--delete-mise-toml`, deletes the generated mise.toml. Mutually exclusive
 * with the tool-uninstall positional args.
 */
async function doUnwireAgents(
  options: UninstallCommandOptions,
  configPath: string,
  config: AgentenvConfig,
  json: boolean,
  fail: (message: string, exitCode?: 1 | 2) => void,
  startedAt: number,
): Promise<void> {
  const usageError = (message: string): void => {
    if (options.command && !json) options.command.error(message);
    else fail(message, 2);
  };

  if (options.tools && options.tools.length > 0) {
    usageError(
      '--unwire-agents cannot be combined with specific tool arguments; run them separately.',
    );
    return;
  }

  const value = options.unwireAgents;
  const fullUnwire = value === true;
  let agents: AgentKey[];
  if (fullUnwire) {
    agents = getEnabledAgents(config) as AgentKey[];
  } else {
    const parsed = parseAgentList(value as string);
    if (parsed.unknown.length > 0) {
      usageError(`Unknown agent(s) to unwire: ${parsed.unknown.join(', ')}`);
      return;
    }
    agents = parsed.agents;
  }

  if (options.deleteMiseToml && !fullUnwire) {
    usageError(
      '--delete-mise-toml requires --unwire-agents with no specific agent list (mise.toml is shared, not agent-specific).',
    );
    return;
  }

  if (agents.length === 0 && !(fullUnwire && options.deleteMiseToml)) {
    if (json) printUninstallJson({ success: true, message: 'Nothing to unwire.', configPath });
    else printResult('warn', 'Nothing to unwire.');
    return;
  }

  const scope: ScopeValue = config.scope ?? 'project';
  const baseDir = resolveScopeDir(scope);
  const plan = buildUnwirePlan(
    config,
    baseDir,
    scope,
    agents,
    fullUnwire,
    options.deleteMiseToml === true,
  );

  if (options.dryRun) {
    if (json) {
      printUninstallJson({
        success: true,
        message: 'no changes were made',
        configPath,
        dryRun: true,
        unwiredAgents: agents,
        filesChanged: filesChangedFrom(plan),
        deletedMiseToml: plan.miseToml?.exists ?? false,
      });
    } else {
      const lines: string[] = agents.map((agent) => `  ${agent} — would run cleanup()`);
      for (const file of [...plan.agentFiles, ...plan.sharedFiles]) {
        lines.push(`  ${file.path} — ${file.status}${file.message ? ` (${file.message})` : ''}`);
      }
      if (plan.miseToml) {
        lines.push(
          `  ${plan.miseToml.path} — ${plan.miseToml.exists ? 'would delete' : 'already absent'}`,
        );
      }
      console.log(lines.join('\n'));
      printResult('warn', 'Dry run complete', 'no changes were made', Date.now() - startedAt);
    }
    return;
  }

  if (!options.yes) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const proceed = await confirm({
        message: fullUnwire
          ? `Unwire ${agents.length} agent(s) and remove agentenv-managed instruction blocks?`
          : `Unwire ${agents.length} agent(s)?`,
        default: false,
      });
      if (!proceed) {
        if (json) printUninstallJson({ success: true, message: 'Aborted', configPath });
        else printResult('warn', 'Aborted', 'no changes were made');
        return;
      }
    } else {
      fail(
        'Interactive confirmation requires a TTY; pass `--yes` (or `--dry-run` to preview) to run non-interactively.',
      );
      return;
    }
  }

  const result = await executeUnwire(baseDir, plan);
  if (!result.success) {
    fail(`Unwire failed: ${result.errors.join('; ')}`);
    return;
  }
  if (json) {
    printUninstallJson({
      success: true,
      message: `Unwired ${agents.length} agent(s)`,
      configPath,
      unwiredAgents: agents,
      filesChanged: filesChangedFrom(plan),
      deletedMiseToml: plan.miseToml?.exists ?? false,
    });
    return;
  }
  console.log(result.messages.join('\n'));
  printResult('ok', `Unwired ${agents.length} agent(s)`, undefined, Date.now() - startedAt);
}

/**
 * Cleanup: remove the config-declared, mise-managed tools from the mise store.
 * Does not modify agentenv.toml or the generated mise.toml — `agentenv apply`
 * re-installs everything.
 */
export async function doUninstall(options: UninstallCommandOptions): Promise<void> {
  const startedAt = Date.now();
  const json = options.json === true;
  if (json) setQuietEnabled(true);
  renderLogo();

  const fail = (message: string, exitCode: 1 | 2 = 1): void => {
    if (json) printUninstallJson({ success: false, message });
    else console.error(message);
    process.exitCode = exitCode;
  };

  // 1. Config resolution (mirrors update.ts).
  let configPath: string | null;
  if (options.scope) {
    configPath = configFilePath(options.scope);
    if (!fs.existsSync(configPath)) {
      fail(`No agentenv.toml found at ${configPath} (scope ${options.scope}).`);
      return;
    }
  } else {
    configPath = findConfigPath() ?? null;
    if (!configPath) {
      fail('No agentenv.toml found. Run `agentenv setup` first.');
      return;
    }
  }
  if (!json) printConfigPath(configPath);

  let config: AgentenvConfig;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }
  const report = validateConfig(config);
  if (report.errors.length > 0) {
    if (json) printUninstallJson({ success: false, message: report.errors.join('; ') });
    else reportValidation(report, 'Configuration invalid — not applying.');
    process.exitCode = 1;
    return;
  }
  if (!json) reportValidation(report, 'Configuration invalid — not applying.');

  if (options.unwireAgents !== undefined) {
    await doUnwireAgents(options, configPath, config, json, fail, startedAt);
    return;
  }
  if (options.deleteMiseToml) {
    const message = '--delete-mise-toml requires --unwire-agents.';
    if (options.command && !json) options.command.error(message);
    else fail(message, 2);
    return;
  }

  // 2. Argument validation runs immediately after config resolution, before
  //    confirmation, the mise gate, or any uninstall.
  const targets = calculateUninstallTargets(config);
  const { matched, unknown } = resolveToolArgs(options.tools ?? [], targets);
  if (unknown.length > 0) {
    const message = `Unknown tool(s) to uninstall: ${unknown.join(', ')}`;
    if (options.command && !json) {
      // Usage error, not an operational failure — exit 2, matching
      // docs/guides/exit-codes.md.
      options.command.error(message);
    } else {
      fail(message, 2);
    }
    return;
  }
  const requested = options.tools && options.tools.length > 0 ? matched : targets;

  // 3. No-op path needs no mise.
  if (requested.length === 0) {
    if (json) printUninstallJson({ success: true, message: 'Nothing to uninstall.', configPath });
    else printResult('warn', 'Nothing to uninstall.');
    return;
  }

  const scopeDir = resolveScopeDir(config.scope ?? 'project');
  const miseToml = path.join(scopeDir, 'mise.toml');
  const miseTomlPath = fs.existsSync(miseToml) ? miseToml : undefined;

  // 4. Dry run never mutates; single allowlisted probe when mise is present.
  if (options.dryRun) {
    if (!isMiseInstalled()) {
      const plan = { toUninstall: [] as string[], alreadyGone: [] as string[] };
      if (json) {
        printUninstallJson({
          success: true,
          message: 'nothing was uninstalled (mise not installed)',
          configPath,
          dryRun: true,
          toUninstall: [],
          alreadyGone: [],
        });
      } else {
        console.log(renderUninstallSummary(requested, plan, 'preview', true).join('\n'));
        printResult('warn', 'Dry run complete', 'nothing was uninstalled (mise not installed)');
      }
      return;
    }
    const state = readInstalledState();
    if (!state) {
      fail('mise ls --json failed or returned unrecognized output.');
      return;
    }
    const plan = uninstallPlan(requested, state);
    if (json) {
      printUninstallJson({
        success: true,
        message: 'no changes were made',
        configPath,
        dryRun: true,
        toUninstall: plan.toUninstall,
        alreadyGone: plan.alreadyGone,
      });
    } else {
      console.log(renderUninstallSummary(requested, plan, 'preview', false).join('\n'));
      printResult('warn', 'Dry run complete', 'no changes were made', Date.now() - startedAt);
    }
    return;
  }

  // 5. Fail-closed mise gate: unknown installed state is not "already gone".
  if (!isMiseInstalled()) {
    if (json) {
      printUninstallJson({ success: false, message: 'agentenv uninstall requires mise' });
      process.exitCode = 1;
    } else {
      console.error('agentenv uninstall requires mise, but mise was not found.');
      for (const line of miseInstallInstructions()) console.error(`  ${line}`);
      process.exitCode = 1;
    }
    return;
  }

  // 6. Plan from live state.
  const state = readInstalledState();
  if (!state) {
    fail('mise ls --json failed or returned unrecognized output.');
    return;
  }
  const plan = uninstallPlan(requested, state);
  if (plan.toUninstall.length === 0) {
    if (json) printUninstallJson({ success: true, message: 'Nothing to uninstall.', configPath });
    else printResult('warn', 'Nothing to uninstall.');
    return;
  }

  // 7. Confirmation, only when there is actually something to remove.
  if (!options.yes) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const proceed = await confirm({
        message: `Uninstall ${plan.toUninstall.length} tool(s) from the mise store?`,
        default: false,
      });
      if (!proceed) {
        if (json) printUninstallJson({ success: true, message: 'Aborted', configPath });
        else printResult('warn', 'Aborted', 'no changes were made');
        return;
      }
    } else {
      fail(
        'Interactive confirmation requires a TTY; pass `--yes` (or `--dry-run` to preview) to run non-interactively.',
      );
      return;
    }
  }

  // 8. Uninstall.
  const result = runMiseUninstall(plan.toUninstall, scopeDir, miseTomlPath);
  if (!result.success) {
    fail(
      `mise uninstall failed (exit ${result.exitCode ?? 'null'}): ${normalizeOutput(result.stderr || result.stdout).trim()}`,
    );
    return;
  }
  if (json) {
    printUninstallJson({
      success: true,
      message: `Removed ${plan.toUninstall.length} tool(s)`,
      configPath,
      toUninstall: plan.toUninstall,
      alreadyGone: plan.alreadyGone,
    });
    return;
  }
  console.log(renderUninstallSummary(requested, plan, 'result', false).join('\n'));
  printResult(
    'ok',
    `Removed ${plan.toUninstall.length} tool(s)`,
    'These are no longer installed in the mise store; `agentenv apply` will reinstall them.',
    Date.now() - startedAt,
  );
}

export const uninstallCommand = new Command()
  .name('uninstall')
  .description(
    'Uninstall mise-managed tools in your config from the mise store (cleanup); `apply` re-installs them',
  )
  .argument(
    '[tools...]',
    'specific tools to uninstall (config key, binary name, or mise name); default: all enabled',
  )
  .option('--yes', 'skip the confirmation prompt (required when non-interactive)')
  .option('--dry-run', 'print what would be uninstalled without changing anything')
  .option('--scope <scope>', 'config scope to use: project|user (default: nearest config)')
  .option('--json', 'emit a machine-readable JSON document on stdout')
  .option(
    '--unwire-agents [agents]',
    'unwire agent hook config and managed instruction blocks; comma-separated agent keys, or every enabled agent if no value is given. Cannot be combined with [tools...].',
  )
  .option(
    '--delete-mise-toml',
    'also delete the generated mise.toml (requires --unwire-agents with no specific agents)',
  )
  .action((tools: string[], options: UninstallCommandOptions, command: Command) => {
    const scope = parseScopeFlag(options.scope);
    if (scope.error) {
      command.error(scope.error);
      return;
    }
    return doUninstall({ ...options, scope: scope.scope, tools, command });
  });
