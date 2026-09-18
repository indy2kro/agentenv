import { theme } from './theme.js';

let quiet = false;

/** Global quiet state, wired to `-q/--quiet` in index.ts. */
export function setQuietEnabled(enabled: boolean): void {
  quiet = enabled;
}

export function isQuiet(): boolean {
  return quiet;
}

/** Pure predicate so banner gating is unit-testable without a real TTY. */
export function shouldPrintBanner(isTTY: boolean, quietMode: boolean): boolean {
  return isTTY && !quietMode;
}

/** Print a banner/footer heading, suppressed when piped or in quiet mode. */
export function banner(text: string): void {
  if (shouldPrintBanner(process.stdout.isTTY === true, quiet)) {
    console.log(theme.heading(text));
  }
}

/** Embedded `agentenv` wordmark, printed once at the start of every command. */
const LOGO_LINES = [
  '    ___                    __',
  '   /   | ____ ____  ____  / /____  ____ _   __',
  '  / /| |/ __ `/ _ \\/ __ \\/ __/ _ \\/ __ \\ | / /',
  ' / ___ / /_/ /  __/ / / / /_/  __/ / / / |/ /',
  '/_/  |_\\__, /\\___/_/ /_/\\__/\\___/_/ /_/|___/',
  '      /____/',
];

/** The ASCII wordmark as a single block of text (unit-testable constant). */
export const LOGO = LOGO_LINES.join('\n');

/** Print the logo, gated like a banner (TTY + not quiet). */
export function renderLogo(): void {
  if (shouldPrintBanner(process.stdout.isTTY === true, quiet)) {
    console.log(`\n${theme.heading(LOGO)}\n`);
  }
}

export type ResultSeverity = 'ok' | 'warn' | 'fail';

export interface ResultBoxContent {
  severity: ResultSeverity;
  headline: string;
  summary?: string;
}

const RESULT_GLYPHS: Record<ResultSeverity, string> = {
  ok: '✅',
  warn: '⚠️',
  fail: '❌',
};

function severityColor(text: string, severity: ResultSeverity): string {
  if (severity === 'ok') return theme.ok(text);
  if (severity === 'warn') return theme.warn(text);
  return theme.fail(text);
}

/**
 * Code point ranges rendered 2 columns wide by virtually every terminal
 * (CJK + emoji blocks). Deliberately excludes Box Drawing (U+2500-257F) —
 * the ┌─│└┘ border characters below are narrow, single-column glyphs.
 */
const WIDE_RANGES: Array<[number, number]> = [
  [0x1100, 0x115f],
  [0x2600, 0x27bf], // Misc Symbols & Dingbats — covers ✅ ⚠ ❌
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f000, 0x1ffff],
  [0x20000, 0x3fffd],
];

/**
 * Approximate terminal column width of a string. Plain `.length` (UTF-16
 * code units) undercounts the ✅/⚠️/❌ glyphs in RESULT_GLYPHS below: every
 * terminal renders them as 2 columns wide, but ✅/❌ are a single code unit
 * and ⚠️ is two (warning sign + the invisible U+FE0F variation selector).
 * Without this, `formatResultBox` sizes the border from `.length` and the
 * box ends up one column narrower than the glyph line actually renders.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfe0f || code === 0x200d) continue; // variation selector-16 / ZWJ: zero-width
    width += WIDE_RANGES.some(([start, end]) => code >= start && code <= end) ? 2 : 1;
  }
  return width;
}

/**
 * Draw the result box: a full-width-consistent frame around the glyph-prefixed
 * headline and (optional) summary line, whole box colored by outcome. Glyphs
 * and words survive `--no-color`, so the outcome is never color-only.
 */
export function formatResultBox(result: ResultBoxContent): string {
  const bodyLines = [`${RESULT_GLYPHS[result.severity]} ${result.headline}`];
  if (result.summary !== undefined) bodyLines.push(result.summary);
  const widths = bodyLines.map(displayWidth);
  const contentWidth = Math.max(...widths);
  const mid = bodyLines.map((line, i) => `│ ${line}${' '.repeat(contentWidth - widths[i])} │`);
  const edge = `┌${'─'.repeat(contentWidth + 2)}┐`;
  const bottom = `└${'─'.repeat(contentWidth + 2)}┘`;
  const plain = [edge, ...mid, bottom].join('\n');
  return severityColor(plain, result.severity);
}

/**
 * Human result line: a colored box on a TTY, the plain headline otherwise
 * (piped/quiet), so scripts keep seeing today's stable data line.
 */
export function resolveResultLine(
  result: ResultBoxContent,
  isTTY: boolean = process.stdout.isTTY === true,
  quietMode: boolean = quiet,
): string {
  return shouldPrintBanner(isTTY, quietMode) ? formatResultBox(result) : result.headline;
}
