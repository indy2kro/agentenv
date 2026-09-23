/**
 * A single spinner wrapping one long-running step (e.g. the whole
 * applyConfiguration() call — mise install + per-agent adapters + optional
 * integrations). Deliberately one spinner per call site rather than one per
 * internal sub-step: applyConfiguration() stays a pure array-builder with no
 * knowledge of presentation, so tests (which call it directly, in bulk)
 * never see spinner/ora output.
 */

import ora from 'ora';
import { isQuiet } from './output.js';
import { colorizeLine, failGlyph, successGlyph } from './theme.js';

export interface Spinner {
  start(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  /** Pause rendering without a succeed/fail glyph, so a caller can print raw output (e.g. streamed mise install progress) without the spinner fighting it for the terminal line, then `start()` again to resume. */
  stop(): Spinner;
}

export type SpinnerFactory = (text: string) => Spinner;

const defaultSpinnerFactory: SpinnerFactory = (text) => ora(text) as unknown as Spinner;

const quietSpinner: Spinner = {
  start: () => quietSpinner,
  succeed: () => quietSpinner,
  fail: () => quietSpinner,
  stop: () => quietSpinner,
};

/** A non-animated stand-in: prints the label once, then a plain succeed/fail line — no redrawing. */
function staticSpinner(label: string): Spinner {
  const spinner: Spinner = {
    start: () => {
      console.log(label);
      return spinner;
    },
    succeed: (text) => {
      console.log(colorizeLine(`${successGlyph()} ${text ?? label}`));
      return spinner;
    },
    fail: (text) => {
      console.log(colorizeLine(`${failGlyph()} ${text ?? label}`));
      return spinner;
    },
    stop: () => spinner,
  };
  return spinner;
}

let spinnerOverride: boolean | undefined;

/** Force the animated spinner on/off; pass undefined to restore auto-detection. Wired to --no-spinner. */
export function setSpinnerEnabled(enabled: boolean | undefined): void {
  spinnerOverride = enabled;
}

/**
 * Whether to animate: off under TERM=dumb or CI (most CI systems set
 * CI=true; the animation floods a non-interactive log with redraw frames),
 * unless --no-spinner/setSpinnerEnabled() overrides either way.
 */
export function isSpinnerEnabled(): boolean {
  if (spinnerOverride !== undefined) return spinnerOverride;
  return process.env.TERM !== 'dumb' && !process.env.CI;
}

/**
 * Run fn() under a spinner labeled `label`, resolving succeed/fail from the
 * result's `success` field. `-q/--quiet` swaps in a no-op spinner so quiet
 * output is actually silent even on a TTY; `--no-spinner`/TERM=dumb/CI swap
 * the *real* (ora) spinner for a static, non-animated one that still prints
 * the label and succeed/fail lines — an explicitly injected `spinnerFactory`
 * (as every test passes) is never second-guessed by that auto-detection,
 * since a test double has no animation to disable in the first place. `fn`
 * receives the spinner itself so a long inner step can `stop()` it before
 * printing raw output and `start()` it again afterwards.
 */
export async function withSpinner<T extends { success: boolean }>(
  label: string,
  fn: (spinner: Spinner) => Promise<T>,
  spinnerFactory: SpinnerFactory = defaultSpinnerFactory,
): Promise<T> {
  let factory: SpinnerFactory;
  if (isQuiet()) {
    factory = (): Spinner => quietSpinner;
  } else if (spinnerFactory === defaultSpinnerFactory && !isSpinnerEnabled()) {
    factory = staticSpinner;
  } else {
    factory = spinnerFactory;
  }
  const spinner = factory(label).start();
  try {
    const result = await fn(spinner);
    if (result.success) spinner.succeed(label);
    else spinner.fail(label);
    return result;
  } catch (error) {
    spinner.fail(label);
    throw error;
  }
}
