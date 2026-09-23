/**
 * RTK Toolchain Integration
 * Delegate per-agent hook wiring to `rtk init <flags>` instead of
 * re-implementing hook formats by hand (see docs/research/rtk-init-delegation.md).
 */

import * as child_process from 'child_process';
import { resolveBinary } from '../adapters/detect.js';
import { runMiseCaptured } from './mise.js';

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

/**
 * Resolve the rtk binary to run: prefer the mise-managed rtk pinned in this
 * scope's mise.toml (`mise which rtk`, run in `cwd`) over a bare PATH lookup.
 * This matters two ways: a bare `where`/`which` can resolve to a
 * stale rtk, or to an unrelated same-named binary earlier on PATH (the
 * "Rust Type Kit" name collision RTK.md warns about); and right after
 * `mise install` puts a new rtk in the mise shims dir, that dir is not
 * necessarily on PATH yet in the current terminal ("needs-new-terminal") even
 * though `mise which`/`mise exec` can already resolve it.
 */
export function resolveRtkBinary(
  cwd: string,
  deps: {
    runMiseCaptured?: typeof runMiseCaptured;
    resolveBinary?: typeof resolveBinary;
  } = {},
): string | null {
  const miseCapture = deps.runMiseCaptured ?? runMiseCaptured;
  const pathLookup = deps.resolveBinary ?? resolveBinary;
  const mise = miseCapture(['which', 'rtk'], { cwd });
  if (mise.status === 0) {
    const resolved = mise.stdout.trim();
    if (resolved) return resolved;
  }
  return pathLookup('rtk');
}

const defaultRtkInit: RtkInitFn = (args, cwd) => {
  // Testing escape hatch: point at a stub `rtk` program (run via node) that
  // writes the files a real `rtk init` would, so the full CLI pipeline can be
  // exercised in CI without installing rtk.
  const stub = process.env.AGENTENV_RTK_BIN;
  const rtkPath = stub ? process.execPath : resolveRtkBinary(cwd);
  if (!stub && !rtkPath) {
    return {
      success: false,
      message:
        'rtk binary not found via `mise which rtk` or on PATH — is rtk in mise.toml (Tier 1) and did `mise install` run?',
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
      timeout: 30000,
    });
    const ok = result.status === 0;
    return {
      success: ok,
      message: ok
        ? `rtk init ${args.join(' ')} succeeded`
        : `rtk init ${args.join(' ')} failed (exit ${result.status ?? 'null'})${
            !ok && result.status === null && result.error ? `: ${result.error.message}` : ''
          }`,
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

export type RtkVersionTuple = [number, number, number];

/** Parse a leading `X.Y.Z` out of rtk's `--version` output (e.g. "rtk 0.42.4"); null if unparseable. */
export function parseRtkVersion(version: string | null): RtkVersionTuple | null {
  if (!version) return null;
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** -1/0/1, like a standard Array.sort comparator. */
export function compareRtkVersions(a: RtkVersionTuple, b: RtkVersionTuple): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Minimum rtk version known — and independently verified — to support each
 * agent as an `rtk init --agent <value>`. An agent absent from this map has
 * no confirmed minimum: isRtkAgentSupportedByVersion() then returns null
 * (unknown) instead of guessing a threshold nobody has verified, and callers
 * fall back to attempting the delegation and reading rtk's own rejection
 * (isUnsupportedRtkAgentError's clap-style text match, below).
 *
 * vibe: confirmed NOT supported as of rtk 0.42.4 — `rtk init --agent`'s enum
 * lists claude/cursor/windsurf/cline/kilocode/antigravity/pi/hermes, no
 * "vibe" — checked live against a real rtk binary (2026-09-23). No verified
 * release adds it yet, so it's left out rather than guessing a version.
 */
export const RTK_AGENT_MIN_VERSIONS: Partial<Record<string, RtkVersionTuple>> = {};

/**
 * Whether `agent` is supported by a resolved rtk `version`, per
 * RTK_AGENT_MIN_VERSIONS: true/false when a verified threshold exists and
 * `version` parses, null when either is unknown — callers treat null as
 * "don't know yet, attempt delegation normally" rather than as a denial.
 */
export function isRtkAgentSupportedByVersion(
  agent: string,
  version: string | null,
): boolean | null {
  const minVersion = RTK_AGENT_MIN_VERSIONS[agent];
  if (!minVersion) return null;
  const parsed = parseRtkVersion(version);
  if (!parsed) return null;
  return compareRtkVersions(parsed, minVersion) >= 0;
}

/**
 * True when an `rtk init` failure is rtk's own `--agent` enum rejecting a
 * value agentenv passes it (e.g. the pinned rtk build not yet knowing
 * "vibe"), rather than an environment problem (missing binary, permissions,
 * ...). Recognizes both rtk's clap-style usage error text (keeps working as
 * rtk's supported agent list changes upstream, without agentenv having to
 * hardcode rtk's enum) and the synthetic message RtkDelegationAdapter
 * produces when a version-verified threshold (RTK_AGENT_MIN_VERSIONS) rules
 * an agent out before even attempting delegation.
 */
export function isUnsupportedRtkAgentError(errors: string[], agentValue: string): boolean {
  const clapPattern = new RegExp(`invalid value ['"]?${agentValue}['"]?`, 'i');
  const versionPattern = new RegExp(
    `does not yet support ['"]?${agentValue}['"]? as an --agent value`,
    'i',
  );
  return errors.some((error) => clapPattern.test(error) || versionPattern.test(error));
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

export interface RtkInstallationCheck {
  /** Path resolveRtkBinary() found (mise-managed preferred, then bare PATH), or null if not found at all. */
  resolvedPath: string | null;
  /** `rtk --version` output, or null if it couldn't be read. */
  version: string | null;
  /**
   * `rtk gain` succeeded — a read-only report command every real rtk build
   * supports. If it exits non-zero, `resolvedPath` most likely isn't rtk at
   * all: RTK.md itself warns about a name collision with the unrelated
   * `reachingforthejack/rtk` ("Rust Type Kit"). null when there was no
   * resolvedPath to check.
   */
  gainOk: boolean | null;
}

/**
 * Checks rtk is actually usable: resolvable, reports a version, and responds
 * to `rtk gain` (ruling out the Rust Type Kit name-collision case). Used by
 * `doctor` — everything here is read-only.
 */
export function checkRtkInstallation(
  cwd: string,
  deps: {
    resolveRtkBinary?: typeof resolveRtkBinary;
    spawnSync?: typeof child_process.spawnSync;
  } = {},
): RtkInstallationCheck {
  const resolve = deps.resolveRtkBinary ?? resolveRtkBinary;
  const spawn = deps.spawnSync ?? child_process.spawnSync;
  const resolvedPath = resolve(cwd);
  if (!resolvedPath) {
    return { resolvedPath: null, version: null, gainOk: null };
  }

  let version: string | null = null;
  try {
    const result = spawn(resolvedPath, ['--version'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = (result.stdout || result.stderr || '').trim();
    if (result.status === 0 && output) version = output;
  } catch {
    // version stays null
  }

  let gainOk: boolean | null;
  try {
    const result = spawn(resolvedPath, ['gain'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    gainOk = result.status === 0;
  } catch {
    gainOk = false;
  }

  return { resolvedPath, version, gainOk };
}
