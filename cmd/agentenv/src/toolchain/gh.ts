/**
 * GitHub CLI Authentication Status
 * Read-only probe of `gh auth status`; agentenv never manages GitHub
 * credentials (docs/superpowers/specs/2026-09-14-optional-integrations-design.md).
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
 * Runs exactly `gh auth status --hostname github.com`, classifying by exit
 * code only. stdout/stderr are captured for classification but never
 * returned or printed — the design forbids surfacing auth output verbatim.
 */
export const defaultGhAuthProbe: GhAuthProbeFn = () => {
  const ghPath = resolveBinary('gh');
  if (!ghPath) return { status: 'not_installed' };

  try {
    const result = child_process.spawnSync(ghPath, ['auth', 'status', '--hostname', 'github.com'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status === 0) return { status: 'authenticated' };
    if (result.status === 1) return { status: 'unauthenticated' };
    return { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
  }
};

/** Resolve the gh auth probe to use, defaulting to the real one. */
export function resolveGhAuthProbe(probe?: GhAuthProbeFn): GhAuthProbeFn {
  return probe ?? defaultGhAuthProbe;
}
