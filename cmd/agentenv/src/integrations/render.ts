/**
 * Rendering helpers for integration results, shared by `apply` and `status`.
 */

import type { IntegrationAgentState, IntegrationResult } from './base.js';
import { asciiGlyphsEnabled } from '../ui/theme.js';

function stateGlyph(state: IntegrationAgentState['state']): string {
  const ascii = asciiGlyphsEnabled();
  switch (state) {
    case 'installed':
      return ascii ? '[ok]' : '✓';
    case 'missing':
      return ascii ? '[FAIL]' : '✗';
    case 'unsupported':
      return ascii ? '[-]' : '·';
    case 'drifted':
      return '!'; // already ASCII-safe
  }
}

/** Render a single integration/agent pair as a one-line status string. */
export function integrationStateLine(state: IntegrationAgentState): string {
  const glyph = stateGlyph(state.state);
  const detail = state.detail ? ` (${state.detail})` : '';
  return `${glyph} ${state.agent}: ${state.state}${detail}`;
}

/**
 * Render an IntegrationResult into display lines: agent states first, then
 * the native commands that were run, changed files, and warnings. Errors are
 * intentionally excluded — callers decide how to surface them.
 */
export function integrationResultLines(result: IntegrationResult): string[] {
  const lines: string[] = result.agents.map(integrationStateLine);
  if (result.nativeCommands.length > 0) {
    lines.push(`ran: ${result.nativeCommands.join('; ')}`);
  }
  if (result.changedFiles.length > 0) {
    lines.push(`wrote: ${result.changedFiles.join(', ')}`);
  }
  for (const warning of result.warnings) lines.push(`warning: ${warning}`);
  return lines;
}

/** Render the gh auth result as a single display line. */
export function ghAuthLine(
  status: 'authenticated' | 'unauthenticated' | 'unknown' | 'not_installed',
): string {
  const ascii = asciiGlyphsEnabled();
  const glyph =
    status === 'authenticated'
      ? ascii
        ? '[ok]'
        : '✓'
      : status === 'unauthenticated'
        ? ascii
          ? '[FAIL]'
          : '✗'
        : status === 'not_installed'
          ? ascii
            ? '[-]'
            : '·'
          : '?';
  const label =
    status === 'authenticated'
      ? 'authenticated'
      : status === 'unauthenticated'
        ? 'not authenticated'
        : status === 'not_installed'
          ? 'gh not installed'
          : 'unknown';
  return `${glyph} github.com: ${label}`;
}
