/**
 * RTK Toolchain Integration
 * Delegate per-agent hook wiring to `rtk init <flags>` instead of
 * re-implementing hook formats by hand (see docs/research/rtk-init-delegation.md).
 */

import * as child_process from 'child_process';
import { resolveBinary } from '../adapters/detect.js';

export interface RtkInitResult {
  success: boolean;
  message: string;
  stdout: string;
  stderr: string;
}

/**
 * Runs `rtk init` with the given args in the given cwd. Injectable so tests
 * can stub it (CI has no rtk on PATH).
 */
export type RtkInitFn = (args: string[], cwd: string) => RtkInitResult;

/** rtk init args per agent, verified against real `rtk init` in smoke:real. */
export const RTK_INIT_FLAGS: Record<string, string[]> = {
  claude_code: ['--claude'],
  codex_cli: ['--codex'],
  copilot: ['--copilot'],
  opencode: ['-g', '--opencode'],
  // rtk 0.49.0 rejects project-scoped init for these with "Gemini/Cursor/
  // Windsurf/Vibe support is global-only. Use: rtk init -g ...", so the `-g`
  // is mandatory (like opencode above), not a preference. Cline is the one
  // delegated agent rtk accepts project-scoped by default.
  gemini_cli: ['-g', '--gemini'],
  cursor: ['-g', '--agent', 'cursor'],
  windsurf: ['-g', '--agent', 'windsurf'],
  cline: ['--agent', 'cline'],
  vibe: ['-g', '--agent', 'vibe'],
};

const defaultRtkInit: RtkInitFn = (args, cwd) => {
  // Testing escape hatch: point at a stub `rtk` program (run via node) that
  // writes the files a real `rtk init` would, so the full CLI pipeline can be
  // exercised in CI without installing rtk.
  const stub = process.env.AGENTENV_RTK_BIN;
  const rtkPath = stub ? process.execPath : resolveBinary('rtk');
  if (!stub && !rtkPath) {
    return {
      success: false,
      message:
        'rtk binary not found on PATH — is rtk in mise.toml (Tier 1) and did `mise install` run?',
      stdout: '',
      stderr: '',
    };
  }

  const cmd = stub ? process.execPath : (rtkPath as string);
  const cmdArgs = stub ? [stub, 'init', ...args] : ['init', ...args];

  try {
    const result = child_process.spawnSync(cmd, cmdArgs, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    const ok = result.status === 0;
    return {
      success: ok,
      message: ok
        ? `rtk init ${args.join(' ')} succeeded`
        : `rtk init ${args.join(' ')} failed (exit ${result.status ?? 'null'})`,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } catch (err) {
    return {
      success: false,
      message: `rtk init ${args.join(' ')} errored: ${
        err instanceof Error ? err.message : String(err)
      }`,
      stdout: '',
      stderr: '',
    };
  }
};

/** Resolve the rtk init function to use, defaulting to the real one. */
export function resolveRtkInit(rtkInit?: RtkInitFn): RtkInitFn {
  return rtkInit ?? defaultRtkInit;
}

/**
 * True when an `rtk init` failure is rtk's own `--agent` enum rejecting a
 * value agentenv passes it (e.g. the pinned rtk build not yet knowing
 * "vibe"), rather than an environment problem (missing binary, permissions,
 * ...). Detected from rtk's clap-style usage error text so this keeps
 * working as rtk's supported agent list changes upstream, without agentenv
 * having to hardcode rtk's enum.
 */
export function isUnsupportedRtkAgentError(errors: string[], agentValue: string): boolean {
  const pattern = new RegExp(`invalid value ['"]?${agentValue}['"]?`, 'i');
  return errors.some((error) => pattern.test(error));
}

/**
 * Surfaces what rtk actually rewrote as part of the per-agent message, so its
 * work isn't silently invisible (Phase 4 transparency log).
 * Also notes the side effect of creating ~/.local/share/rtk/history.db
 */
export function rtkMessage(run: RtkInitResult): string {
  const rewrote = run.stdout.replace(/\s+/g, ' ').trim();
  if (!rewrote) return run.message;
  const summary = rewrote.length > 400 ? rewrote.slice(0, 400).trimEnd() + '...' : rewrote;

  // Add transparency note about rtk history database creation
  // As documented in docs/research/rtk-init-delegation.md and phase0-linux-verification.md
  const message = `${run.message}: ${summary}`;

  // Note: rtk init always creates ~/.local/share/rtk/history.db (command history database)
  // This is a side effect that users should be aware of
  return message;
}
