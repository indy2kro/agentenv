import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, validateConfig } from '../config/schema.js';
import { configFilePath, findConfigPath, resolveScopeDir } from '../config/scopes.js';
import {
  ensureGlobalShimsDir,
  getMiseVersion,
  getUpgradeableTools,
  isMiseInstalled,
  miseInstallInstructions,
  runMiseSelfUpdate,
  runMiseUpgrade,
  trustMiseToml,
  verifyToolAvailability,
} from '../toolchain/mise.js';
import type { AgentenvConfig } from '../config/schema.js';

interface UpdateCommandOptions {
  self?: boolean;
  tools?: boolean;
  scope?: string;
}

async function doUpdate(options: UpdateCommandOptions): Promise<void> {
  if (!isMiseInstalled()) {
    console.error('agentenv update requires mise, but mise was not found.');
    for (const line of miseInstallInstructions()) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }

  console.log('\n=== agentenv Update ===\n');
  console.log(`Mise: ${getMiseVersion()}\n`);

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
  console.log(`Config: ${configPath}\n`);

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

  const doSelf =
    options.self === true || (options.tools === undefined && options.self === undefined);
  const doTools =
    options.tools === true || (options.tools === undefined && options.self === undefined);

  let failed = false;

  const shims = ensureGlobalShimsDir();
  if (shims.success) console.log(`Shims: ${shims.message}`);
  else console.error(`Shims: ${shims.message}`);

  if (doSelf) {
    console.log('\nUpdating mise itself...');
    const result = await runMiseSelfUpdate();
    if (result.success) {
      console.log(`  mise self-update: ${result.output || 'already up to date'}`);
    } else {
      console.error(
        `  mise self-update failed: ${result.output || 'no output'} (some install methods, e.g. winget, do not support self-update)`,
      );
      failed = true;
    }
  }

  if (doTools) {
    console.log('\nUpgrading mise-managed tools...');
    const scopeDir = resolveScopeDir(config.scope ?? 'project');
    const miseTomlPath = path.join(scopeDir, 'mise.toml');
    if (!fs.existsSync(miseTomlPath)) {
      console.error(`  ${miseTomlPath} not found — run \`agentenv apply\` first.`);
      failed = true;
    } else {
      const trust = trustMiseToml(miseTomlPath, scopeDir);
      if (trust.success) console.log(`  ${trust.message}`);
      else console.error(`  ${trust.message}`);
      if (!trust.success) failed = true;

      const targets = getUpgradeableTools(config);
      if (targets.length === 0) {
        console.log('  No upgradeable tools: everything enabled is pinned to a version.');
      } else {
        console.log(`  mise up ${targets.join(' ')}`);
        const upgrade = await runMiseUpgrade(targets, scopeDir);
        if (upgrade.success) {
          console.log(
            `  ${(upgrade.stdout || upgrade.stderr || '').trim() || 'all tools up to date'}`,
          );
        } else {
          console.error(
            `  mise up failed (exit ${upgrade.exitCode ?? 'null'}): ${upgrade.stderr || upgrade.stdout}`,
          );
          failed = true;
        }

        const availability = verifyToolAvailability(config);
        const onPath = availability.filter((tool) => tool.onPath);
        const notOnPath = availability.filter((tool) => !tool.onPath);
        console.log(
          `  Verify: ${onPath.length}/${availability.length} configured tools resolve on PATH`,
        );
        for (const tool of onPath) console.log(`    ✓ ${tool.binary} (${tool.key})`);
        for (const tool of notOnPath) {
          console.log(
            `    ✗ ${tool.binary} (${tool.key}) — installed but not resolvable in this shell`,
          );
        }
      }
    }
  }

  if (failed) {
    process.exitCode = 1;
  } else {
    console.log('\nUpdate complete!');
  }
}

export const updateCommand = new Command()
  .name('update')
  .description('Update mise itself and the mise-managed tools in your config (unattended)')
  .option('--self', 'only update the mise binary itself')
  .option('--tools', 'only upgrade mise-managed tools (pinned tools are skipped)')
  .option('--scope <scope>', 'config scope to update: project|user (default: nearest config)')
  .action(doUpdate);
