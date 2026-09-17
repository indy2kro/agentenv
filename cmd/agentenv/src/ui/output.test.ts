import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { banner, isQuiet, setQuietEnabled, shouldPrintBanner } from './output.js';

describe('output quiet mode', () => {
  afterEach(() => setQuietEnabled(false));

  it('prints banners only on a TTY and not in quiet mode', () => {
    assert.equal(shouldPrintBanner(true, false), true);
    assert.equal(shouldPrintBanner(false, false), false);
    assert.equal(shouldPrintBanner(true, true), false);
    assert.equal(shouldPrintBanner(false, true), false);
  });

  it('tracks quiet state', () => {
    assert.equal(isQuiet(), false);
    setQuietEnabled(true);
    assert.equal(isQuiet(), true);
  });

  it('banner() prints on a TTY but is suppressed by -q', () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (message?: unknown) => {
      lines.push(String(message));
    };
    try {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

      setQuietEnabled(false);
      banner('\n=== agentenv status ===\n');
      assert.equal(lines.length, 1, 'banner should print on a TTY when not quiet');

      lines.length = 0;
      setQuietEnabled(true);
      assert.equal(isQuiet(), true);
      banner('\n=== Status complete ===\n');
      assert.equal(lines.length, 0, 'banner should be suppressed in quiet mode');
    } finally {
      console.log = originalLog;
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    }
  });
});
