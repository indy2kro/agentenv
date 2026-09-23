/**
 * `agentenv add` / `agentenv remove` — non-interactive config edits.
 * Flips tool/agent booleans in agentenv.toml and (by default) re-applies,
 * so an AI agent can say "enable jq here" without the TTY-only wizard or
 * hand-editing TOML.
 */
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  AGENT_KEYS,
  TOOL_KEYS,
  loadConfig,
  saveConfig,
  validateConfig,
  type AgentenvConfig,
} from '../config/schema.js';
import { configFilePath, findConfigPath, parseScopeFlag } from '../config/scopes.js';
import type { ScopeValue } from '../config/scopes.js';
import { applyConfiguration, buildApplyJsonResult } from './apply.js';
import { saveAndApply } from './setup.js';
import { renderLogo, setQuietEnabled } from '../ui/output.js';
import { printConfigPath, printResult, reportValidation } from '../ui/report.js';

export type ConfigEditKind = 'tool' | 'agent';

/** Classify `name` as a tool or agent config key, or undefined if it's neither. */
export function classifyConfigKey(name: string): ConfigEditKind | undefined {
  if ((AGENT_KEYS as readonly string[]).includes(name)) return 'agent';
  if ((TOOL_KEYS as readonly string[]).includes(name)) return 'tool';
  return undefined;
}

export interface ConfigEditChange {
  kind: ConfigEditKind;
  key: string;
  from: boolean;
  to: boolean;
}

export interface ConfigEditPlan {
  changes: ConfigEditChange[];
  unknown: string[];
}

/**
 * Plan the tool/agent boolean flips `add`/`remove` would make, without
 * mutating `config`. An item already at the target value produces no
 * change — `add jq` on an already-enabled jq is a silent no-op, not an
 * error, matching `uninstall`'s "already gone" treatment of a live target.
 */
export function planConfigEdit(
  config: AgentenvConfig,
  items: string[],
  enable: boolean,
): ConfigEditPlan {
  const changes: ConfigEditChange[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const kind = classifyConfigKey(name);
    if (!kind) {
      unknown.push(name);
      continue;
    }
    const current =
      kind === 'agent'
        ? ((config.agents as Record<string, boolean> | undefined)?.[name] ?? false)
        : ((config.tools as Record<string, boolean> | undefined)?.[name] ?? false);
    if (current === enable) continue;
    changes.push({ kind, key: name, from: current, to: enable });
  }
  return { changes, unknown };
}

/** Apply a plan's changes to a shallow copy of `config`; never mutates the input. */
export function applyConfigEdit(config: AgentenvConfig, plan: ConfigEditPlan): AgentenvConfig {
  const next: AgentenvConfig = {
    ...config,
    agents: { ...config.agents },
    tools: { ...config.tools },
  };
  for (const change of plan.changes) {
    const bucket = (change.kind === 'agent' ? next.agents : next.tools) as Record<string, boolean>;
    bucket[change.key] = change.to;
  }
  return next;
}

function changeLine(change: ConfigEditChange): string {
  return `  ${change.kind} ${change.key}: ${change.from} -> ${change.to}`;
}

interface ConfigEditOptions {
  scope?: ScopeValue;
  dryRun?: boolean;
  json?: boolean;
  /** commander's --no-apply sets this to false; default true. */
  apply?: boolean;
  skipMiseInstall?: boolean;
  command?: Command;
}

async function doConfigEdit(
  items: string[],
  enable: boolean,
  options: ConfigEditOptions,
): Promise<void> {
  const startedAt = Date.now();
  const json = options.json === true;
  if (json) setQuietEnabled(true);
  renderLogo();
  const verb = enable ? 'add' : 'remove';

  const fail = (message: string, exitCode: 1 | 2 = 1): void => {
    if (json) console.log(JSON.stringify({ success: false, message }, null, 2));
    else console.error(message);
    process.exitCode = exitCode;
  };
  const usageError = (message: string): void => {
    if (options.command && !json) options.command.error(message);
    else fail(message, 2);
  };

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
    config = loadConfig(configPath, { layerUserConfig: true });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }
  const report = validateConfig(config);
  if (report.errors.length > 0) {
    if (json)
      console.log(JSON.stringify({ success: false, message: report.errors.join('; ') }, null, 2));
    else reportValidation(report, 'Configuration invalid — not editing.');
    process.exitCode = 1;
    return;
  }
  if (!json) reportValidation(report, 'Configuration invalid — not editing.');

  const plan = planConfigEdit(config, items, enable);
  if (plan.unknown.length > 0) {
    usageError(
      `Unknown tool/agent key(s) to ${verb}: ${plan.unknown.join(', ')}. Valid keys: ${[...AGENT_KEYS, ...TOOL_KEYS].join(', ')}`,
    );
    return;
  }

  if (plan.changes.length === 0) {
    if (json)
      console.log(
        JSON.stringify({ success: true, message: 'Nothing to change.', configPath }, null, 2),
      );
    else printResult('warn', 'Nothing to change.');
    return;
  }

  if (options.dryRun) {
    if (json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            message: 'no changes were made',
            configPath,
            dryRun: true,
            changes: plan.changes,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(plan.changes.map(changeLine).join('\n'));
      printResult('warn', 'Dry run complete', 'no changes were made', Date.now() - startedAt);
    }
    return;
  }

  const nextConfig = applyConfigEdit(config, plan);

  if (options.apply === false) {
    saveConfig(nextConfig, configPath);
    const message = `Updated ${plan.changes.length} setting(s)`;
    if (json) {
      console.log(
        JSON.stringify(
          { success: true, message, configPath, changes: plan.changes, applied: false },
          null,
          2,
        ),
      );
    } else {
      console.log(plan.changes.map(changeLine).join('\n'));
      printResult(
        'ok',
        message,
        'Run `agentenv apply` to apply the change.',
        Date.now() - startedAt,
      );
    }
    return;
  }

  if (json) {
    saveConfig(nextConfig, configPath);
    const baseDir = path.dirname(configPath);
    const result = await applyConfiguration(nextConfig, baseDir, {
      skipMiseInstall: options.skipMiseInstall,
      skipPrereqMessage: true,
    });
    const applyJson = buildApplyJsonResult(result, { configPath, baseDir, warnings: [] });
    console.log(JSON.stringify({ ...applyJson, changes: plan.changes }, null, 2));
    if (!result.success) process.exitCode = 1;
    return;
  }

  console.log(plan.changes.map(changeLine).join('\n'));
  await saveAndApply(nextConfig, configPath, {
    startedAt,
    successMessage: `Updated ${plan.changes.length} setting(s) and applied`,
    skipMiseInstall: options.skipMiseInstall,
  });
}

function registerConfigEditFlags(command: Command): Command {
  return command
    .option('--scope <scope>', 'config scope to use: project|user (default: nearest config)')
    .option('--dry-run', 'print what would change without saving or applying')
    .option('--json', 'emit a machine-readable JSON document on stdout')
    .option('--no-apply', 'save the config change without running apply')
    .option('--skip-mise-install', 'when applying, generate files only — no `mise install`');
}

export const addCommand = registerConfigEditFlags(
  new Command()
    .name('add')
    .description('Enable tool(s)/agent(s) in agentenv.toml, then apply (unless --no-apply)')
    .argument('<items...>', 'tool or agent config keys to enable (e.g. ripgrep, claude_code)'),
).action((items: string[], options: ConfigEditOptions, command: Command) => {
  const scope = parseScopeFlag(options.scope);
  if (scope.error) {
    command.error(scope.error);
    return;
  }
  return doConfigEdit(items, true, { ...options, scope: scope.scope, command });
});

export const removeCommand = registerConfigEditFlags(
  new Command()
    .name('remove')
    .description('Disable tool(s)/agent(s) in agentenv.toml, then apply (unless --no-apply)')
    .argument('<items...>', 'tool or agent config keys to disable (e.g. ripgrep, claude_code)'),
).action((items: string[], options: ConfigEditOptions, command: Command) => {
  const scope = parseScopeFlag(options.scope);
  if (scope.error) {
    command.error(scope.error);
    return;
  }
  return doConfigEdit(items, false, { ...options, scope: scope.scope, command });
});
