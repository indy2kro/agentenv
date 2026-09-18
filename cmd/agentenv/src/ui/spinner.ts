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

export interface Spinner {
  start(): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
}

export type SpinnerFactory = (text: string) => Spinner;

const defaultSpinnerFactory: SpinnerFactory = (text) => ora(text) as unknown as Spinner;

const quietSpinner: Spinner = {
  start: () => quietSpinner,
  succeed: () => quietSpinner,
  fail: () => quietSpinner,
};

/**
 * Run fn() under a spinner labeled `label`, resolving succeed/fail from the
 * result's `success` field. `-q/--quiet` swaps in a no-op spinner so quiet
 * output is actually silent even on a TTY.
 */
export async function withSpinner<T extends { success: boolean }>(
  label: string,
  fn: () => Promise<T>,
  spinnerFactory: SpinnerFactory = defaultSpinnerFactory,
): Promise<T> {
  const factory = isQuiet() ? (): Spinner => quietSpinner : spinnerFactory;
  const spinner = factory(label).start();
  try {
    const result = await fn();
    if (result.success) spinner.succeed(label);
    else spinner.fail(label);
    return result;
  } catch (error) {
    spinner.fail(label);
    throw error;
  }
}
