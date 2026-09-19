/**
 * `agentenv shell-fix` — inspect and undo the Tier 0 shell configuration that
 * `apply` writes into per-user agent config files on Windows. `apply` records
 * every write it makes (see `shell/shell-fix-state.ts`); this command is the
 * read side plus the revert path, so those edits are no longer a one-way door.
 */

import { Command } from 'commander';
import {
  readShellFixState,
  shellFixStatePath,
  type ShellFixStateEntry,
} from '../shell/shell-fix-state.js';
import {
  checkAgentShellConfiguration,
  revertShellFixes,
  type ShellFixRevertResult,
} from '../shell/detector.js';
import type { AgentKey } from '../config/schema.js';
import { renderLogo, setQuietEnabled } from '../ui/output.js';
import { printResult } from '../ui/report.js';

/** Agents whose Tier 0 fix writes a per-user config file (see detector.ts). */
const MANAGED_AGENTS: AgentKey[] = ['claude_code', 'codex_cli', 'opencode'];

export interface ShellFixCurrent {
  agent: AgentKey;
  configured: boolean;
  shell: string | null;
}

export interface ShellFixShowJson {
  command: 'shell-fix';
  statePath: string;
  bashExe: string | null;
  recorded: ShellFixStateEntry[];
  current: ShellFixCurrent[];
  exitCode: 0;
}

/** Read the recorded manifest plus the live per-agent shell configuration. */
export function gatherShellFixShow(): ShellFixShowJson {
  const state = readShellFixState();
  const current = MANAGED_AGENTS.map((agent) => {
    const info = checkAgentShellConfiguration(agent);
    return { agent, configured: info.isConfigured, shell: info.shell ?? null };
  });
  return {
    command: 'shell-fix',
    statePath: shellFixStatePath(),
    bashExe: state?.bashExe ?? null,
    recorded: state?.entries ?? [],
    current,
    exitCode: 0,
  };
}

export function renderShellFixShow(payload: ShellFixShowJson): string {
  const lines: string[] = [`State file: ${payload.statePath}`];
  if (payload.recorded.length === 0) {
    lines.push('Recorded changes: none');
  } else {
    lines.push(`Recorded changes (${payload.recorded.length}):`);
    for (const entry of payload.recorded) {
      const created = entry.createdFile ? ' (created by agentenv)' : '';
      lines.push(`  ${entry.agent} — ${entry.file}${created}`);
      for (const field of entry.fields) {
        const previous = field.previous === null ? '(unset)' : field.previous;
        lines.push(`    ${field.key}: ${previous} → ${payload.bashExe ?? ''}`);
      }
    }
  }
  lines.push('Current configuration:');
  for (const item of payload.current) {
    lines.push(
      `  ${item.agent}: ${item.configured ? `configured (${item.shell ?? ''})` : 'not configured'}`,
    );
  }
  return lines.join('\n');
}

export function renderShellFixRevert(results: ShellFixRevertResult[], dryRun: boolean): string[] {
  if (results.length === 0) return ['No recorded Tier 0 shell changes to revert.'];
  const prefix = dryRun ? '(dry run) ' : '';
  return results.map((result) => `  ${result.agent}: ${prefix}${result.message}`);
}

interface ShellFixOptions {
  revert?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export const shellFixCommand = new Command()
  .name('shell-fix')
  .description('Inspect or revert the per-user Tier 0 shell fixes agentenv applied (Windows)')
  .option('--revert', 'undo the recorded Tier 0 shell changes and restore prior values')
  .option('--dry-run', 'with --revert, show what would change without writing')
  .option('--json', 'emit a machine-readable JSON document (show only)')
  .action((options: ShellFixOptions, command: Command) => {
    if (options.json === true && options.revert === true) {
      command.error('--json cannot be combined with --revert (revert mutates files).');
      return;
    }

    if (options.revert === true) {
      renderLogo();
      const dryRun = options.dryRun === true;
      const results = revertShellFixes(undefined, dryRun);
      for (const line of renderShellFixRevert(results, dryRun)) console.log(line);

      const applied = results.filter(
        (result) => result.action === 'reverted' || result.action === 'removed',
      ).length;
      const skipped = results.filter((result) => result.action === 'skipped').length;

      if (results.length === 0 || (applied === 0 && skipped === 0)) {
        printResult('warn', 'Nothing to revert', 'No recorded Tier 0 shell changes.');
        return;
      }
      if (skipped > 0) {
        printResult(
          'warn',
          `Reverted ${applied} of ${results.length} file(s)`,
          `${skipped} file(s) left untouched — see the lines above`,
        );
        process.exitCode = 1;
        return;
      }
      if (dryRun) {
        printResult('warn', 'Dry run complete', `would revert ${applied} file(s); no changes made`);
        return;
      }
      printResult(
        'ok',
        `Reverted ${applied} file(s)`,
        'Tier 0 shell overrides removed; run `agentenv apply` to re-apply them.',
      );
      return;
    }

    if (options.json === true) setQuietEnabled(true);
    const payload = gatherShellFixShow();
    if (options.json === true) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    renderLogo();
    console.log(renderShellFixShow(payload));
    const count = payload.recorded.length;
    printResult(
      'ok',
      count === 0 ? 'No recorded Tier 0 shell changes' : `${count} recorded Tier 0 shell change(s)`,
      count === 0
        ? 'agentenv records them when it points agents at Git Bash on Windows.'
        : 'Use `agentenv shell-fix --revert` to undo them.',
    );
  });
