import { printJson } from '../cli/json.js';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, validateConfig } from '../config/schema.js';
import type { AgentenvConfig } from '../config/schema.js';
import { applyConfiguration } from './apply.js';
import {
  configFilePath,
  findConfigPath,
  parseScopeFlag,
  baseDirForConfig,
} from '../config/scopes.js';
import type { ScopeValue } from '../config/scopes.js';
import type { OutdatedTool } from '../toolchain/mise.js';
import { shellFixStatePath } from '../shell/shell-fix-state.js';
import {
  ensureGlobalShimsDir,
  getMiseVersion,
  getOutdatedTools,
  getUpgradeableTools,
  isMiseInstalled,
  miseActivationHint,
  miseInstallInstructions,
  runMiseSelfUpdate,
  runMiseUpgrade,
  shimsDir,
  shimsDirOnPath,
  summarizeMiseFailures,
  toolAvailabilityLine,
  trustMiseToml,
  verifyHintNeeded,
  verifySummaryLine,
  verifyToolAvailability,
  miseTomlPathFor,
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

/**
 * Every mise-touching call `doUpdate` makes, injectable so tests can stub
 * them the same way `apply.test.ts` stubs `rtkInit`/`superpowersDeps` —
 * without this, exercising update.ts meant actually installing/upgrading
 * mise tools, which is why it sat at 13% line coverage.
 */
export interface UpdateDeps {
  isMiseInstalled?: typeof isMiseInstalled;
  getMiseVersion?: typeof getMiseVersion;
  ensureGlobalShimsDir?: typeof ensureGlobalShimsDir;
  runMiseSelfUpdate?: typeof runMiseSelfUpdate;
  trustMiseToml?: typeof trustMiseToml;
  runMiseUpgrade?: typeof runMiseUpgrade;
  /** Which tools have a newer version (`mise outdated --json`); tests stub it. */
  getOutdatedTools?: typeof getOutdatedTools;
  verifyToolAvailability?: typeof verifyToolAvailability;
  loadConfig?: typeof loadConfig;
  /** Skips the real `watchMiseToml` call entirely (tests never want a live fs.watch). */
  watchMiseToml?: typeof watchMiseToml;
  /** Same, for the agentenv.toml watcher. */
  watchAgentenvConfig?: typeof watchAgentenvConfig;
}

export async function doUpdate(
  options: UpdateCommandOptions,
  deps: UpdateDeps = {},
): Promise<void> {
  const startedAt = Date.now();
  const json = options.json === true;
  if (json) setQuietEnabled(true);

  const isMiseInstalledFn = deps.isMiseInstalled ?? isMiseInstalled;
  const getMiseVersionFn = deps.getMiseVersion ?? getMiseVersion;
  const ensureGlobalShimsDirFn = deps.ensureGlobalShimsDir ?? ensureGlobalShimsDir;
  const runMiseSelfUpdateFn = deps.runMiseSelfUpdate ?? runMiseSelfUpdate;
  const trustMiseTomlFn = deps.trustMiseToml ?? trustMiseToml;
  const runMiseUpgradeFn = deps.runMiseUpgrade ?? runMiseUpgrade;
  const getOutdatedToolsFn = deps.getOutdatedTools ?? getOutdatedTools;
  const verifyToolAvailabilityFn = deps.verifyToolAvailability ?? verifyToolAvailability;
  const loadConfigFn = deps.loadConfig ?? loadConfig;
  const watchMiseTomlFn = deps.watchMiseToml ?? watchMiseToml;
  const watchAgentenvConfigFn = deps.watchAgentenvConfig ?? watchAgentenvConfig;

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
  // Filled by --check/--dry-run: the managed tools that have a newer version.
  let outdated: OutdatedTool[] | undefined;
  const finish = (success: boolean, elapsedMs?: number): void => {
    if (json) printJson({ success, messages, errors, elapsedMs, outdated });
  };

  if (!isMiseInstalledFn()) {
    logErr('agentenv update requires mise, but mise was not found.');
    for (const line of miseInstallInstructions()) logErr(`  ${line}`);
    finish(false);
    process.exitCode = 1;
    return;
  }

  renderLogo();
  log(`Mise: ${getMiseVersionFn()}\n`);

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
    config = loadConfigFn(configPath, { layerUserConfig: true });
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
    const shims = ensureGlobalShimsDirFn(shellFixStatePath());
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
      const result = await runMiseSelfUpdateFn();
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
    const scopeDir = baseDirForConfig(configPath, config.scope ?? 'project');
    const miseTomlPath = miseTomlPathFor(config.scope, scopeDir);
    if (!fs.existsSync(miseTomlPath)) {
      logErr(`  ${miseTomlPath} not found — run \`agentenv apply\` first.`);
      failed = true;
    } else {
      if (dryRun) {
        log(`  would trust ${miseTomlPath}`);
      } else {
        const trust = trustMiseTomlFn(miseTomlPath, scopeDir);
        if (trust.success) log(`  ${trust.message}`);
        else logErr(`  ${trust.message}`);
        if (!trust.success) failed = true;
      }

      const targets = getUpgradeableTools(config);
      if (targets.length === 0) {
        log('  No upgradeable tools: everything enabled is pinned to a version.');
      } else {
        log(`  mise up ${targets.join(' ')}${dryRun ? ' (would run)' : ''}`);
        if (dryRun) {
          const all = getOutdatedToolsFn(scopeDir);
          if (all === null) {
            log('  could not check for newer versions (mise outdated failed)');
          } else {
            outdated = all.filter((row) => targets.includes(row.tool));
            if (outdated.length === 0) log('  all upgradeable tools are up to date');
            for (const row of outdated) {
              log('  outdated: ' + row.tool + ' ' + row.current + ' -> ' + row.latest);
            }
          }
        }
        if (!dryRun) {
          // Human mode shows mise's own progress live (it can run for minutes);
          // --json collects everything into the one document instead.
          let streamed = false;
          const upgrade = await runMiseUpgradeFn(
            targets,
            scopeDir,
            json
              ? undefined
              : (chunk) => {
                  streamed = true;
                  process.stdout.write(chunk);
                },
          );
          if (upgrade.success) {
            if (!streamed) {
              log(`  ${(upgrade.stdout || upgrade.stderr || '').trim() || 'all tools up to date'}`);
            }
          } else {
            const output = `${upgrade.stderr}\n${upgrade.stdout}`;
            const failures = summarizeMiseFailures(output);
            const head = `  mise up failed (exit ${upgrade.exitCode ?? 'null'})`;
            if (failures.length > 0) {
              // Name what broke; the rest of mise's output was already shown
              // (human mode) or is still in the JSON document's raw detail.
              logErr(`${head} for:`);
              for (const failure of failures) logErr(`    ${failure}`);
              logErr(
                '  The other tools were upgraded. Pin a broken tool under [tool_versions], or `agentenv remove <tool>` to stop managing it.',
              );
              if (json) logErr(normalizeOutput(upgrade.stderr || upgrade.stdout).trim());
            } else if (streamed) {
              logErr(`${head}; see mise's output above.`);
            } else {
              logErr(`${head}: ${normalizeOutput(upgrade.stderr || upgrade.stdout).trim()}`);
            }
            failed = true;
          }
        }

        const availability = verifyToolAvailabilityFn(config, {
          cwd: scopeDir,
          miseTomlPath,
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
      console.log(
        '\nWatching agentenv.toml (re-applies files + tools) and mise.toml (mise up); Ctrl+C to stop...',
      );
      const scopeDir = baseDirForConfig(configPath, config.scope ?? 'project');
      const miseTomlPath = miseTomlPathFor(config.scope, scopeDir);
      // A re-apply rewrites mise.toml; the mise watcher must not treat that as an edit.
      let paused = false;
      watchMiseTomlFn(miseTomlPath, scopeDir, configPath, undefined, () => paused);
      watchAgentenvConfigFn(configPath, scopeDir, {
        onBusy: (busy) => {
          paused = busy;
        },
      });
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
  isPaused: () => boolean = () => false,
): fs.FSWatcher | undefined {
  const resolvedPath = path.resolve(miseTomlPath);
  // fs.realpathSync.native canonicalizes 8.3-short-name vs. long-name and
  // casing differences that path.resolve() leaves alone. On Windows, a
  // mismatch between this and what ReadDirectoryChangesW reports back trips
  // a known libuv assertion ("Assertion failed: !_wcsnicmp(filename, dir,
  // dirlen)", src/win/fs-event.c) that aborts the whole process, not just
  // this watch — seen on GitHub Actions Windows runners, whose temp dir can
  // resolve to a short-name form (e.g. RUNNER~1).
  let resolvedDir: string;
  try {
    resolvedDir = fs.realpathSync.native(path.resolve(scopeDir));
  } catch {
    resolvedDir = path.resolve(scopeDir);
  }
  // The watch target is the directory the mise file really lives in. In user
  // scope that is <mise config>/conf.d, not the agentenv config directory
  // (scopeDir), where a file with the same name is agentenv's own config.
  let watchDir: string;
  try {
    watchDir = fs.realpathSync.native(path.dirname(resolvedPath));
  } catch {
    watchDir = path.dirname(resolvedPath);
  }
  const watchedName = path.basename(resolvedPath);

  let timeout: NodeJS.Timeout | null = null;

  try {
    const watcher = fs.watch(watchDir, (_eventType, filename) => {
      // A directory watch fires for every file in watchDir; only react
      // to mise.toml itself. When the platform can't report a filename,
      // don't filter it out — better an extra check than a missed one.
      if (filename && filename !== watchedName) return;
      if (isPaused()) return;

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        // An atomic-rename save briefly removes the old path before the
        // new one lands; nothing to do yet if it hasn't landed.
        if (!fs.existsSync(resolvedPath)) return;
        if (isPaused()) return;

        console.log(`\nDetected change in ${resolvedPath}, running mise up...`);
        let config: AgentenvConfig;
        try {
          config = loadConfig(configPath, { layerUserConfig: true });
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
      `Failed to watch ${watchDir}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return undefined;
  }
}

export interface WatchAgentenvConfigOptions {
  debounceMs?: number;
  /** How long to stay "busy" after an apply finishes, so its own file writes settle. */
  settleMs?: number;
  /** Injectable apply; tests never run a real one. */
  apply?: typeof applyConfiguration;
  /** Told true before a re-apply starts and false once it has settled. */
  onBusy?: (busy: boolean) => void;
}

/**
 * Watch agentenv.toml and, when it changes, re-apply the generated files and
 * the tool install (`only: files, tools`). The agent wiring is deliberately
 * left out: that writes to the user's home directory, and a file save is not a
 * request to do that again. This is the file people actually edit; mise.toml is
 * only ever written by apply.
 *
 * Watches the directory (editors save via atomic rename, which replaces the
 * file's inode) and reads the config fresh on every trigger.
 */
export function watchAgentenvConfig(
  configPath: string,
  baseDir: string,
  options: WatchAgentenvConfigOptions = {},
): { close(): void } | undefined {
  const debounceMs = options.debounceMs ?? 1000;
  const settleMs = options.settleMs ?? 2000;
  const apply = options.apply ?? applyConfiguration;
  const resolvedConfig = path.resolve(configPath);
  const watchedName = path.basename(resolvedConfig);
  let watchDir: string;
  try {
    watchDir = fs.realpathSync.native(path.dirname(resolvedConfig));
  } catch {
    watchDir = path.dirname(resolvedConfig);
  }

  let timeout: NodeJS.Timeout | null = null;
  let running = false;
  try {
    const watcher = fs.watch(watchDir, (_eventType, filename) => {
      if (filename && filename !== watchedName) return;
      if (running) return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        if (!fs.existsSync(resolvedConfig) || running) return;
        let config: AgentenvConfig;
        try {
          config = loadConfig(resolvedConfig, { layerUserConfig: true });
        } catch (error) {
          console.error(
            `  Could not re-read ${resolvedConfig}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        const report = validateConfig(config);
        if (report.errors.length > 0) {
          for (const error of report.errors) console.error(`  error: ${error}`);
          console.error('  Configuration invalid; not re-applying.');
          return;
        }

        running = true;
        options.onBusy?.(true);
        console.log(`\nDetected change in ${resolvedConfig}, re-applying files and tools...`);
        try {
          const result = await apply(config, baseDir, {
            only: ['files', 'tools'],
            skipPrereqMessage: true,
            fileConfig: config.scope === 'project' ? loadConfig(resolvedConfig) : undefined,
          });
          for (const message of result.messages) console.log(`  ${message}`);
          for (const error of result.errors) console.error(`  ${error}`);
          if (!result.success)
            console.error('  Re-apply failed; fix the errors above and save again.');
        } catch (error) {
          console.error(
            `  Re-apply failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          setTimeout(() => {
            running = false;
            options.onBusy?.(false);
          }, settleMs);
        }
      }, debounceMs);
    });
    watcher.on('error', (err) => {
      console.error(`Watch error: ${err instanceof Error ? err.message : String(err)}`);
    });
    process.on('SIGINT', () => watcher.close());
    return { close: () => watcher.close() };
  } catch (err) {
    console.error(
      `Failed to watch ${watchDir}: ${err instanceof Error ? err.message : String(err)}`,
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
  .option(
    '--watch',
    'keep running: re-apply files + tools when agentenv.toml changes, and run mise up when mise.toml is edited (optional)',
  )
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
