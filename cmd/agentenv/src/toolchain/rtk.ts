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

/** rtk init args per agent, matching `rtk 0.42.4` (verified, see research doc). */
export const RTK_INIT_FLAGS: Record<string, string[]> = {
  codex_cli: ['--codex', '--auto-patch'],
  copilot: ['--copilot', '--auto-patch'],
  opencode: ['-g', '--opencode', '--auto-patch'],
};

const defaultRtkInit: RtkInitFn = (args, cwd) => {
  const rtkPath = resolveBinary('rtk');
  if (!rtkPath) {
    return {
      success: false,
      message:
        'rtk binary not found on PATH — is rtk in mise.toml (Tier 1) and did `mise install` run?',
      stdout: '',
      stderr: '',
    };
  }

  try {
    const result = child_process.spawnSync(rtkPath, ['init', ...args], {
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
