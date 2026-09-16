/**
 * Windows error display normalization (Task 12 of the Windows Shell
 * Compatibility Overhaul plan).
 *
 * Captured subprocess output on Windows can carry `\r\n` line endings; printing
 * it verbatim garbles multi-line hints (double line breaks, stray `\r`). This
 * tiny helper strips `\r` and collapses the tail to a single trailing newline
 * so every stderr-derived message is CRLF-clean before a theme renderer prints
 * it.
 */

/**
 * Strip carriage returns and guarantee exactly one trailing newline (or ''
 * for empty input).
 */
export function normalizeOutput(text: string): string {
  const stripped = text.replace(/\r/g, '');
  const collapsed = stripped.replace(/\n+$/, '');
  return collapsed === '' ? '' : `${collapsed}\n`;
}
