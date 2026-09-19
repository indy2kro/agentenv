/**
 * GitHub CLI Authentication Status
 * Read-only probe of `gh auth status`; agentenv never manages GitHub
 * credentials.
 */

import * as child_process from 'child_process';
import { resolveBinary } from '../adapters/detect.js';

export type GhAuthStatus = 'authenticated' | 'unauthenticated' | 'unknown' | 'not_installed';

export interface GhAuthProbeResult {
  status: GhAuthStatus;
}

/** Injectable so tests never spawn a real `gh` binary. */
export type GhAuthProbeFn = () => GhAuthProbeResult;

/**
 * Classify `gh auth status` output. Legacy: exit-code-only split where any
 * non-zero meant "unauthenticated". Refined: exit 1 with network-ish stderr
 * (offline, DNS, TLS, proxy, timeout) means "can't tell", not "logged out" —
 * so `agentenv status` stops asserting a definitive unauthenticated state on
 * what is really a connectivity failure.
 */
export function classifyGhAuthStatus(status: number | null, stderr: string): GhAuthStatus {
  if (status === 0) return 'authenticated';
  if (status === 1) {
    const netMarkers =
      /connection|connect to|network|timeout|timed out|tls|ssl|dns|resolve|proxy|offline|refused|unreachable/i;
    if (netMarkers.test(stderr)) return 'unknown';
    return 'unauthenticated';
  }
  return 'unknown';
}

/**
 * Runs exactly `gh auth status --hostname github.com`, classifying by exit
 * code plus a light stderr scan for connectivity markers. stdout/stderr are
 * captured for classification but never returned or printed — the design
 * forbids surfacing auth output verbatim.
 */
export const defaultGhAuthProbe: GhAuthProbeFn = () => {
  const ghPath = resolveBinary('gh');
  if (!ghPath) return { status: 'not_installed' };

  try {
    const result = child_process.spawnSync(ghPath, ['auth', 'status', '--hostname', 'github.com'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: classifyGhAuthStatus(result.status, result.stderr ?? '') };
  } catch {
    return { status: 'unknown' };
  }
};

/** Resolve the gh auth probe to use, defaulting to the real one. */
export function resolveGhAuthProbe(probe?: GhAuthProbeFn): GhAuthProbeFn {
  return probe ?? defaultGhAuthProbe;
}
