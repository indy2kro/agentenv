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
