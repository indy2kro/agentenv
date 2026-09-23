/**
 * Terminal color/formatting helpers shared by every command's output.
 * Chalk auto-detects TTY/NO_COLOR/FORCE_COLOR on import; setColorEnabled(false)
 * is the only override this CLI needs (wired to --no-color in index.ts).
 */

import chalk from 'chalk';
import { execFileSync } from 'child_process';

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

export interface AsciiDetectionEnv {
  /** Overrides process.env.AGENTENV_ASCII ("1"/"true" forces ASCII, "0"/"false" forces Unicode). */
  forceAscii?: string;
  term?: string;
  platform?: NodeJS.Platform;
  getWindowsCodePage?: () => number | undefined;
}

/** The active Windows console code page (e.g. 437, 65001), or undefined if `chcp` can't be read. */
function detectWindowsCodePage(): number | undefined {
  try {
    const output = execFileSync('chcp.com', [], {
      encoding: 'utf8',
      timeout: 1000,
      windowsHide: true,
    });
    const match = /(\d+)/.exec(output);
    return match ? Number(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the console likely can't render ✓/✗/✅/⚠️/❌ reliably: an explicit
 * AGENTENV_ASCII override, TERM=dumb, or (on Windows) an active code page
 * other than 65001 (UTF-8) — legacy `conhost` defaults to the OS locale's
 * code page (437 on a US system), which renders these as mojibake.
 */
export function useAsciiGlyphs(env: AsciiDetectionEnv = {}): boolean {
  const forceAscii = env.forceAscii ?? process.env.AGENTENV_ASCII;
  if (forceAscii === '1' || forceAscii === 'true') return true;
  if (forceAscii === '0' || forceAscii === 'false') return false;

  if ((env.term ?? process.env.TERM) === 'dumb') return true;

  if ((env.platform ?? process.platform) === 'win32') {
    const codePage = (env.getWindowsCodePage ?? detectWindowsCodePage)();
    if (codePage !== undefined && codePage !== 65001) return true;
  }

  return false;
}

let cachedAsciiGlyphs: boolean | undefined;

/** useAsciiGlyphs() for the real process environment, probed once per process and cached. */
export function asciiGlyphsEnabled(): boolean {
  if (cachedAsciiGlyphs === undefined) cachedAsciiGlyphs = useAsciiGlyphs();
  return cachedAsciiGlyphs;
}

/** Test-only: clear the cached ascii-mode detection so a new environment can be probed. */
export function resetAsciiGlyphsCache(): void {
  cachedAsciiGlyphs = undefined;
}

/** The glyph agentenv prints for a passing/configured check. */
export function successGlyph(): string {
  return asciiGlyphsEnabled() ? '[ok]' : '✓';
}

/** The glyph agentenv prints for a failing/missing check. */
export function failGlyph(): string {
  return asciiGlyphsEnabled() ? '[FAIL]' : '✗';
}

/** The glyph agentenv prints for a tool/agent this platform doesn't support. */
export function unsupportedGlyph(): string {
  return asciiGlyphsEnabled() ? '[-]' : '·';
}

// Already ASCII-safe; kept as a named export so callers don't hardcode '!'.
export const DRIFT_GLYPH = '!';

const UNICODE_GLYPHS = { success: '✓', fail: '✗', unsupported: '·' };
const ASCII_GLYPHS = { success: '[ok]', fail: '[FAIL]', unsupported: '[-]' };

/**
 * Colorize a pre-formatted message line by its leading status glyph (or a
 * "warning:" substring), so command output built elsewhere in the pipeline
 * (mise, adapters, integrations) gets consistent coloring without every
 * producer needing to know about chalk. Recognizes both the Unicode and
 * ASCII-fallback glyph forms, regardless of which mode produced the line.
 */
export function colorizeLine(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith(UNICODE_GLYPHS.success) || trimmed.startsWith(ASCII_GLYPHS.success)) {
    return theme.ok(line);
  }
  if (trimmed.startsWith(UNICODE_GLYPHS.fail) || trimmed.startsWith(ASCII_GLYPHS.fail)) {
    return theme.fail(line);
  }
  if (trimmed.startsWith(DRIFT_GLYPH) || line.toLowerCase().includes('warning:')) {
    return theme.warn(line);
  }
  if (
    trimmed.startsWith(UNICODE_GLYPHS.unsupported) ||
    trimmed.startsWith(ASCII_GLYPHS.unsupported)
  ) {
    return theme.dim(line);
  }
  return line;
}
