/**
 * Terminal color/formatting helpers shared by every command's output.
 * Chalk auto-detects TTY/NO_COLOR/FORCE_COLOR on import; setColorEnabled(false)
 * is the only override this CLI needs (wired to --no-color in index.ts).
 */

import chalk from 'chalk';

export function setColorEnabled(enabled: boolean): void {
  if (!enabled) chalk.level = 0;
}

export const theme = {
  heading: (text: string) => chalk.bold.cyan(text),
  bold: (text: string) => chalk.bold(text),
  dim: (text: string) => chalk.dim(text),
  ok: (text: string) => chalk.green(text),
  fail: (text: string) => chalk.red(text),
  warn: (text: string) => chalk.yellow(text),
};

const SUCCESS_GLYPH = '✓';
const FAIL_GLYPH = '✗';
const DRIFT_GLYPH = '!';
const UNSUPPORTED_GLYPH = '·';

/**
 * Colorize a pre-formatted message line by its leading status glyph (or a
 * "warning:" substring), so command output built elsewhere in the pipeline
 * (mise, adapters, integrations) gets consistent coloring without every
 * producer needing to know about chalk.
 */
export function colorizeLine(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith(SUCCESS_GLYPH)) return theme.ok(line);
  if (trimmed.startsWith(FAIL_GLYPH)) return theme.fail(line);
  if (trimmed.startsWith(DRIFT_GLYPH) || line.toLowerCase().includes('warning:')) {
    return theme.warn(line);
  }
  if (trimmed.startsWith(UNSUPPORTED_GLYPH)) return theme.dim(line);
  return line;
}
