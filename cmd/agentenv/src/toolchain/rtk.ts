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

/** rtk init args per agent, verified against rtk 0.42.4 and 0.49.0. */
export const RTK_INIT_FLAGS: Record<string, string[]> = {
  codex_cli: ['--codex'],
  copilot: ['--copilot'],
  opencode: ['-g', '--opencode'],
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
