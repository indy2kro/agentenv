import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, validateConfig } from '../config/schema.js';
import type { AgentenvConfig } from '../config/schema.js';
import { configFilePath, findConfigPath, resolveScopeDir } from '../config/scopes.js';
import {
  ensureGlobalShimsDir,
  getMiseVersion,
  getUpgradeableTools,
  isMiseInstalled,
  miseActivationHint,
  miseInstallInstructions,
  runMiseSelfUpdate,
  runMiseUpgrade,
  shimsDir,
  shimsDirOnPath,
  toolAvailabilityLine,
  trustMiseToml,
  verifyHintNeeded,
  verifySummaryLine,
  verifyToolAvailability,
} from '../toolchain/mise.js';
import { renderLogo, resolveResultLine } from '../ui/output.js';
import { normalizeOutput } from '../utils/output.js';

interface UpdateCommandOptions {
  self?: boolean;
  tools?: boolean;
  scope?: string;
  watch?: boolean;
  dryRun?: boolean;
  check?: boolean;
}

async function doUpdate(options: UpdateCommandOptions): Promise<void> {
  if (!isMiseInstalled()) {
    console.error('agentenv update requires mise, but mise was not found.');
    for (const line of miseInstallInstructions()) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }

  renderLogo();
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

  const dryRun = options.dryRun === true || options.check === true;
  if (dryRun) console.log('\n[DRY RUN] Printing the update plan; nothing will be changed.\n');

  const doSelf =
    options.self === true || (options.tools === undefined && options.self === undefined);
  const doTools =
    options.tools === true || (options.tools === undefined && options.self === undefined);

  let failed = false;

  if (dryRun) {
    const dir = shimsDir();
    const pathLine = shimsDirOnPath()
      ? `${dir} is on PATH`
      : `would add ${dir} to the global mise config PATH`;
    console.log(`Shims: ${pathLine}`);
  } else {
    const shims = ensureGlobalShimsDir();
    if (shims.success) {
      console.log(`Shims: ${shims.message}`);
    } else {
      console.error(`Shims: ${shims.message}`);
      failed = true;
    }
  }

  if (doSelf) {
    if (dryRun) {
      console.log('\nWould run `mise self-update`.');
    } else {
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
  }

  if (doTools) {
    if (dryRun) {
      console.log('\nUpgrade plan for mise-managed tools:');
    } else {
      console.log('\nUpgrading mise-managed tools...');
    }
    const scopeDir = resolveScopeDir(config.scope ?? 'project');
    const miseTomlPath = path.join(scopeDir, 'mise.toml');
    if (!fs.existsSync(miseTomlPath)) {
      console.error(`  ${miseTomlPath} not found — run \`agentenv apply\` first.`);
      failed = true;
    } else {
      if (dryRun) {
        console.log(`  would trust ${miseTomlPath}`);
      } else {
        const trust = trustMiseToml(miseTomlPath, scopeDir);
        if (trust.success) console.log(`  ${trust.message}`);
        else console.error(`  ${trust.message}`);
        if (!trust.success) failed = true;
      }

      const targets = getUpgradeableTools(config);
      if (targets.length === 0) {
        console.log('  No upgradeable tools: everything enabled is pinned to a version.');
      } else {
        console.log(`  mise up ${targets.join(' ')}${dryRun ? ' (would run)' : ''}`);
        if (!dryRun) {
          const upgrade = await runMiseUpgrade(targets, scopeDir);
          if (upgrade.success) {
            console.log(
              `  ${(upgrade.stdout || upgrade.stderr || '').trim() || 'all tools up to date'}`,
            );
          } else {
            console.error(
              `  mise up failed (exit ${upgrade.exitCode ?? 'null'}): ${normalizeOutput(upgrade.stderr || upgrade.stdout).trim()}`,
            );
            failed = true;
          }
        }

        const availability = verifyToolAvailability(config, {
          cwd: scopeDir,
          miseTomlPath: path.join(scopeDir, 'mise.toml'),
        });
        console.log(`  ${verifySummaryLine(availability)}`);
        for (const tool of availability) console.log(`    ${toolAvailabilityLine(tool)}`);
        if (verifyHintNeeded(availability)) {
          console.log();
          for (const line of miseActivationHint().split('\n')) {
            console.log(`    ${line}`);
          }
        }
      }
    }
  }

  if (failed) {
    process.exitCode = 1;
    console.log(
      `\n${resolveResultLine({ severity: 'fail', headline: 'Update failed', summary: 'one or more tools could not be upgraded — see the messages above' })}\n`,
    );
  } else if (dryRun) {
    console.log(
      `\n${resolveResultLine({ severity: 'ok', headline: 'Dry run complete', summary: 'no changes were made' })}\n`,
    );
  } else {
    console.log(
      `\n${resolveResultLine({ severity: 'ok', headline: 'Update complete!', summary: 'tools are up to date' })}\n`,
    );
  }

  // Optional file watching mode
  if (options.watch && doTools) {
    if (dryRun) {
      console.log('\nSkipping watch mode (dry run).');
    } else {
      console.log('\nWatching mise.toml for changes (Ctrl+C to stop)...');
      const scopeDir = resolveScopeDir(config.scope ?? 'project');
      const miseTomlPath = path.join(scopeDir, 'mise.toml');
      watchMiseToml(miseTomlPath, scopeDir, config);
    }
  }
}

/**
 * Watch mise.toml for changes and trigger mise up when modified.
 * Windows-safe: uses path.resolve() and normalizes paths properly.
 */
function watchMiseToml(miseTomlPath: string, scopeDir: string, config: AgentenvConfig): void {
  const resolvedPath = path.resolve(miseTomlPath);
  const resolvedDir = path.resolve(scopeDir);

  // Normalize the path for Windows (remove redundant segments, etc.)
  const normalizedPath = path.normalize(resolvedPath);

  let timeout: NodeJS.Timeout | null = null;
  const DEBOUNCE_MS = 1000;

  try {
    const watcher = fs.watch(normalizedPath, (eventType) => {
      if (eventType === 'change') {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(async () => {
          console.log(`\nDetected change in ${normalizedPath}, running mise up...`);
          const targets = getUpgradeableTools(config);
          if (targets.length > 0) {
            const upgrade = await runMiseUpgrade(targets, resolvedDir);
            if (upgrade.success) {
              console.log(
                `  ${(upgrade.stdout || upgrade.stderr || '').trim() || 'all tools up to date'}`,
              );
            } else {
              console.error(
                `  mise up failed (exit ${upgrade.exitCode ?? 'null'}): ${upgrade.stderr || upgrade.stdout}`,
              );
            }
          } else {
            console.log('  No upgradeable tools: everything enabled is pinned to a version.');
          }
        }, DEBOUNCE_MS);
      }
    });

    watcher.on('error', (err) => {
      console.error(`Watch error: ${err instanceof Error ? err.message : String(err)}`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nStopping watch...');
      watcher.close();
      process.exit(0);
    });
  } catch (err) {
    console.error(
      `Failed to watch ${normalizedPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export const updateCommand = new Command()
  .name('update')
  .description('Update mise itself and the mise-managed tools in your config (unattended)')
  .option('--self', 'only update the mise binary itself')
  .option('--tools', 'only upgrade mise-managed tools (pinned tools are skipped)')
  .option('--scope <scope>', 'config scope to update: project|user (default: nearest config)')
  .option('--watch', 'watch mise.toml for changes and auto-run mise up (optional)')
  .option('--dry-run', 'print the update plan without changing anything')
  .option('--check', 'alias for --dry-run')
  .action(doUpdate);
