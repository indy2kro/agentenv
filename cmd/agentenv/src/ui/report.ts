import { colorizeLine, failGlyph, theme } from './theme.js';
import { resolveResultLine } from './output.js';
import type { ResultSeverity } from './output.js';

/**
 * Minimal shape of a `validateConfig` result, so this module never needs to
 * depend on the schema layer.
 */
export interface ValidationReportView {
  errors: string[];
  warnings: string[];
}

/** The one config-path line every mutating command prints after resolving its file. */
export function printConfigPath(configPath: string): void {
  console.log(`Config: ${configPath}`);
}

/** Warnings + errors in the shared `warning:` / `error:` shape (colored). */
export function printValidation(report: ValidationReportView): void {
  for (const warning of report.warnings) console.log(theme.warn(`warning: ${warning}`));
  for (const error of report.errors) console.error(theme.fail(`error: ${error}`));
}

/**
 * Shared validation gate: print warnings/errors, and when invalid print the
 * given "not applying" line and return false. Callers set the exit code.
 */
export function reportValidation(report: ValidationReportView, notApplying: string): boolean {
  printValidation(report);
  if (report.errors.length > 0) {
    console.error(theme.fail(notApplying));
    return false;
  }
  return true;
}

export interface TimelineEntry {
  kind: 'message' | 'error';
  text: string;
}

/** An error line that stays distinguishable without color (NO_COLOR, screen readers). */
export function formatErrorLine(error: string): string {
  const glyph = failGlyph();
  return error.trimStart().startsWith(glyph) ? error : `${glyph} ${error}`;
}

/**
 * Apply/setup result tail: colorized messages and themed errors. With a
 * `timeline` they are printed in the order the steps produced them, so a
 * failure appears next to the step it belongs to; without one, messages come
 * first and errors last. Errors always carry a glyph, not just red.
 */
export function printMessages(
  messages: string[],
  errors: string[],
  timeline?: TimelineEntry[],
): void {
  const printError = (error: string): void => console.error(theme.fail(formatErrorLine(error)));
  if (timeline && timeline.length > 0) {
    for (const entry of timeline) {
      if (entry.kind === 'error') printError(entry.text);
      else console.log(colorizeLine(entry.text));
    }
    return;
  }
  for (const message of messages) console.log(colorizeLine(message));
  for (const error of errors) printError(error);
}

/**
 * Human duration for the end-of-run line: sub-second in whole milliseconds,
 * otherwise seconds to one decimal (or `Xm Ys` past a minute). Non-finite and
 * negative inputs clamp to `0ms` so callers never print `NaN`.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}m ${wholeSeconds % 60}s`;
}

/** End-of-run timing phrase: `failed in …` for a fail outcome, else `finished in …`. */
export function timingPhrase(severity: ResultSeverity, ms: number): string {
  return `${severity === 'fail' ? 'failed' : 'finished'} in ${formatDuration(ms)}`;
}

/**
 * Shared result-box line, gated by TTY/quiet exactly like every other result.
 * When `elapsedMs` is given, a timing line is appended (always printed, so a
 * piped/CI run still records how long the command took).
 */
export function printResult(
  severity: ResultSeverity,
  headline: string,
  summary?: string,
  elapsedMs?: number,
): void {
  console.log(`\n${resolveResultLine({ severity, headline, summary })}\n`);
  if (elapsedMs !== undefined) {
    console.log(`${timingPhrase(severity, elapsedMs)}\n`);
  }
}
