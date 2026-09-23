import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, validateConfig } from '../config/schema.js';
import type { AgentenvConfig } from '../config/schema.js';
import {
  configFilePath,
  findConfigPath,
  parseScopeFlag,
  resolveScopeDir,
} from '../config/scopes.js';
import type { ScopeValue } from '../config/scopes.js';
import { shellFixStatePath } from '../shell/shell-fix-state.js';
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
import { renderLogo, setQuietEnabled } from '../ui/output.js';
import { printConfigPath, printResult, reportValidation } from '../ui/report.js';
import { normalizeOutput } from '../utils/output.js';

interface UpdateCommandOptions {
  self?: boolean;
  tools?: boolean;
  scope?: ScopeValue;
  watch?: boolean;
  dryRun?: boolean;
  check?: boolean;
  json?: boolean;
}

async function doUpdate(options: UpdateCommandOptions): Promise<void> {
  const startedAt = Date.now();
  const json = options.json === true;
  if (json) setQuietEnabled(true);

  // In --json mode every line that would otherwise print live is collected
  // instead, so the command emits exactly one JSON document at the end —
  // the same {success, messages, errors} shape `apply --json` uses.
  const messages: string[] = [];
  const errors: string[] = [];
  const log = (line: string): void => {
    if (json) messages.push(line);
    else console.log(line);
  };
  const logErr = (line: string): void => {
    if (json) errors.push(line);
    else console.error(line);
  };
  const finish = (success: boolean, elapsedMs?: number): void => {
    if (json) console.log(JSON.stringify({ success, messages, errors, elapsedMs }, null, 2));
  };

  if (!isMiseInstalled()) {
    logErr('agentenv update requires mise, but mise was not found.');
    for (const line of miseInstallInstructions()) logErr(`  ${line}`);
    finish(false);
    process.exitCode = 1;
    return;
  }

  renderLogo();
  log(`Mise: ${getMiseVersion()}\n`);

  let configPath: string | null;
  if (options.scope) {
    configPath = configFilePath(options.scope);
    if (!fs.existsSync(configPath)) {
      logErr(`No agentenv.toml found at ${configPath} (scope ${options.scope}).`);
      finish(false);
      process.exitCode = 1;
      return;
    }
  } else {
    configPath = findConfigPath() ?? null;
    if (!configPath) {
      logErr('No agentenv.toml found. Run `agentenv setup` first.');
      finish(false);
      process.exitCode = 1;
      return;
    }
  }
  if (!json) printConfigPath(configPath);

  let config: AgentenvConfig;
  try {
    config = loadConfig(configPath);
  } catch (error) {
    logErr(error instanceof Error ? error.message : String(error));
    finish(false);
    process.exitCode = 1;
    return;
  }
  const report = validateConfig(config);
  if (report.errors.length > 0) {
    if (json) errors.push(...report.errors);
    else reportValidation(report, 'Configuration invalid — not applying.');
    finish(false);
    process.exitCode = 1;
    return;
  }
  if (!json) reportValidation(report, 'Configuration invalid — not applying.');

  const dryRun = options.dryRun === true || options.check === true;
  if (dryRun) log('\n[DRY RUN] Printing the update plan; nothing will be changed.\n');

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
    log(`Shims: ${pathLine}`);
  } else {
    const shims = ensureGlobalShimsDir(shellFixStatePath());
    if (shims.success) {
      log(`Shims: ${shims.message}`);
    } else {
      logErr(`Shims: ${shims.message}`);
      failed = true;
    }
  }

  if (doSelf) {
    if (dryRun) {
      log('\nWould run `mise self-update`.');
    } else {
      log('\nUpdating mise itself...');
      const result = await runMiseSelfUpdate();
      if (result.success) {
        log(`  mise self-update: ${result.output || 'already up to date'}`);
      } else {
        logErr(
          `  mise self-update failed: ${result.output || 'no output'} (some install methods, e.g. winget, do not support self-update)`,
        );
        failed = true;
      }
    }
  }

  if (doTools) {
    if (dryRun) {
      log('\nUpgrade plan for mise-managed tools:');
    } else {
      log('\nUpgrading mise-managed tools...');
    }
    const scopeDir = resolveScopeDir(config.scope ?? 'project');
    const miseTomlPath = path.join(scopeDir, 'mise.toml');
    if (!fs.existsSync(miseTomlPath)) {
      logErr(`  ${miseTomlPath} not found — run \`agentenv apply\` first.`);
      failed = true;
    } else {
      if (dryRun) {
        log(`  would trust ${miseTomlPath}`);
      } else {
        const trust = trustMiseToml(miseTomlPath, scopeDir);
        if (trust.success) log(`  ${trust.message}`);
        else logErr(`  ${trust.message}`);
        if (!trust.success) failed = true;
      }

      const targets = getUpgradeableTools(config);
      if (targets.length === 0) {
        log('  No upgradeable tools: everything enabled is pinned to a version.');
      } else {
        log(`  mise up ${targets.join(' ')}${dryRun ? ' (would run)' : ''}`);
        if (!dryRun) {
          const upgrade = await runMiseUpgrade(targets, scopeDir);
          if (upgrade.success) {
            log(`  ${(upgrade.stdout || upgrade.stderr || '').trim() || 'all tools up to date'}`);
          } else {
            logErr(
              `  mise up failed (exit ${upgrade.exitCode ?? 'null'}): ${normalizeOutput(upgrade.stderr || upgrade.stdout).trim()}`,
            );
            failed = true;
          }
        }

        const availability = verifyToolAvailability(config, {
          cwd: scopeDir,
          miseTomlPath: path.join(scopeDir, 'mise.toml'),
        });
        log(`  ${verifySummaryLine(availability)}`);
        for (const tool of availability) log(`    ${toolAvailabilityLine(tool)}`);
        if (verifyHintNeeded(availability)) {
          log('');
          for (const line of miseActivationHint().split('\n')) {
            log(`    ${line}`);
          }
        }
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;
  if (failed) {
    process.exitCode = 1;
    finish(false, elapsedMs);
    if (!json) {
      printResult(
        'fail',
        'Update failed',
        'one or more tools could not be upgraded — see the messages above',
        elapsedMs,
      );
    }
  } else if (dryRun) {
    finish(true, elapsedMs);
    if (!json) printResult('ok', 'Dry run complete', 'no changes were made', elapsedMs);
  } else {
    finish(true, elapsedMs);
    if (!json) printResult('ok', 'Update complete!', 'tools are up to date', elapsedMs);
  }

  // Optional file watching mode. --json prints a single terminal document,
  // which a live watcher can never provide, so it's rejected earlier
  // (see updateCommand's action) rather than silently ignored here.
  if (options.watch && doTools && !json) {
    if (dryRun) {
      console.log('\nSkipping watch mode (dry run).');
    } else {
      console.log('\nWatching mise.toml for changes (Ctrl+C to stop)...');
      const scopeDir = resolveScopeDir(config.scope ?? 'project');
      const miseTomlPath = path.join(scopeDir, 'mise.toml');
      watchMiseToml(miseTomlPath, scopeDir, configPath);
    }
  }
}

/**
 * Watch mise.toml's directory for changes and trigger mise up when it
 * changes, re-reading agentenv.toml fresh each time so a `[tools]` edit
 * made since watch started (via `agentenv apply`, which regenerates
 * mise.toml) is picked up instead of upgrading whatever was enabled when
 * `--watch` started.
 *
 * Watches the *directory*, not the file itself: most editors save via an
 * atomic rename (write a temp file, rename over the original), which
 * replaces the file's inode. A watch on the specific path stops firing
 * after that rename on several platforms/filesystems — a directory watch
 * keeps working, since the directory itself is never replaced.
 *
 * Returns the underlying watcher so callers (and tests) can close it;
 * `debounceMs` is overridable so tests don't have to wait out the real
 * 1000ms debounce.
 */
export function watchMiseToml(
  miseTomlPath: string,
  scopeDir: string,
  configPath: string,
  debounceMs = 1000,
): fs.FSWatcher | undefined {
  const resolvedPath = path.resolve(miseTomlPath);
  const resolvedDir = path.resolve(scopeDir);
  const watchedName = path.basename(resolvedPath);

  let timeout: NodeJS.Timeout | null = null;

  try {
    const watcher = fs.watch(resolvedDir, (_eventType, filename) => {
      // A directory watch fires for every file in resolvedDir; only react
      // to mise.toml itself. When the platform can't report a filename,
      // don't filter it out — better an extra check than a missed one.
      if (filename && filename !== watchedName) return;

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        // An atomic-rename save briefly removes the old path before the
        // new one lands; nothing to do yet if it hasn't landed.
        if (!fs.existsSync(resolvedPath)) return;

        console.log(`\nDetected change in ${resolvedPath}, running mise up...`);
        let config: AgentenvConfig;
        try {
          config = loadConfig(configPath);
        } catch (error) {
          console.error(
            `  Could not re-read ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
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
      }, debounceMs);
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

    return watcher;
  } catch (err) {
    console.error(
      `Failed to watch ${resolvedDir}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
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
  .option('--json', 'emit a machine-readable JSON document on stdout (not with --watch)')
  .action((options: UpdateCommandOptions, command: Command) => {
    const scope = parseScopeFlag(options.scope);
    if (scope.error) {
      command.error(scope.error);
      return;
    }
    if (options.json && options.watch) {
      command.error('--json cannot be combined with --watch (a live watcher has no single result)');
      return;
    }
    return doUpdate({ ...options, scope: scope.scope });
  });
