import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { confirm } from '@inquirer/prompts';
import { BINARY_MAP, loadConfig, validateConfig, type AgentenvConfig } from '../config/schema.js';
import { configFilePath, findConfigPath, resolveScopeDir } from '../config/scopes.js';
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

interface UninstallCommandOptions {
  tools?: string[];
  yes?: boolean;
  dryRun?: boolean;
  scope?: string;
}

/**
 * Cleanup: remove the config-declared, mise-managed tools from the mise store.
 * Does not modify agentenv.toml or the generated mise.toml — `agentenv apply`
 * re-installs everything.
 */
export async function doUninstall(options: UninstallCommandOptions): Promise<void> {
  // 1. Config resolution (mirrors update.ts).
  let configPath: string | null;
  if (options.scope) {
    const scope: 'project' | 'user' = options.scope === 'user' ? 'user' : 'project';
    configPath = configFilePath(scope);
    if (!fs.existsSync(configPath)) {
      console.error(`No agentenv.toml found at ${configPath} (scope ${scope}).`);
      process.exitCode = 1;
      return;
    }
  } else {
    configPath = findConfigPath() ?? null;
    if (!configPath) {
      console.error('No agentenv.toml found. Run `agentenv setup` first.');
      process.exitCode = 1;
      return;
    }
  }
  console.log(`Config: ${configPath}`);

  let config: AgentenvConfig;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  const report = validateConfig(config);
  for (const warning of report.warnings) console.log(`warning: ${warning}`);
  if (report.errors.length > 0) {
    for (const error of report.errors) console.error(`error: ${error}`);
    process.exitCode = 1;
    return;
  }

  // 2. Argument validation runs immediately after config resolution, before
  //    confirmation, the mise gate, or any uninstall.
  const targets = calculateUninstallTargets(config);
  const { matched, unknown } = resolveToolArgs(options.tools ?? [], targets);
  if (unknown.length > 0) {
    console.error(`Unknown tool(s) to uninstall: ${unknown.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const requested = options.tools && options.tools.length > 0 ? matched : targets;

  // 3. No-op path needs no mise.
  if (requested.length === 0) {
    console.log('Nothing to uninstall.');
    return;
  }

  const scopeDir = resolveScopeDir(config.scope ?? 'project');
  const miseToml = path.join(scopeDir, 'mise.toml');
  const miseTomlPath = fs.existsSync(miseToml) ? miseToml : undefined;

  // 4. Dry run never mutates; single allowlisted probe when mise is present.
  if (options.dryRun) {
    if (!isMiseInstalled()) {
      const plan = { toUninstall: [] as string[], alreadyGone: [] as string[] };
      console.log(renderUninstallSummary(requested, plan, 'preview', true).join('\n'));
      return;
    }
    const state = readInstalledState();
    if (!state) {
      process.exitCode = 1;
      return;
    }
    console.log(
      renderUninstallSummary(requested, uninstallPlan(requested, state), 'preview', false).join(
        '\n',
      ),
    );
    return;
  }

  // 5. Fail-closed mise gate: unknown installed state is not "already gone".
  if (!isMiseInstalled()) {
    console.error('agentenv uninstall requires mise, but mise was not found.');
    for (const line of miseInstallInstructions()) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }

  // 6. Plan from live state.
  const state = readInstalledState();
  if (!state) {
    process.exitCode = 1;
    return;
  }
  const plan = uninstallPlan(requested, state);
  if (plan.toUninstall.length === 0) {
    console.log('Nothing to uninstall.');
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
        console.log('Aborted.');
        return;
      }
    } else {
      console.error(
        'Interactive confirmation requires a TTY; pass `--yes` (or `--dry-run` to preview) to run non-interactively.',
      );
      process.exitCode = 1;
      return;
    }
  }

  // 8. Uninstall.
  const result = runMiseUninstall(plan.toUninstall, scopeDir, miseTomlPath);
  if (!result.success) {
    console.error(
      `mise uninstall failed (exit ${result.exitCode ?? 'null'}): ${normalizeOutput(result.stderr || result.stdout).trim()}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(renderUninstallSummary(requested, plan, 'result', false).join('\n'));
  console.log(
    `Removed ${plan.toUninstall.length} tool(s). These are no longer installed in the mise store; \`agentenv apply\` will reinstall them.`,
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
  .action((tools: string[], options: UninstallCommandOptions) =>
    doUninstall({ ...options, tools }),
  );
