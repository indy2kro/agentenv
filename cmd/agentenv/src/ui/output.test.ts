import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  banner,
  formatResultBox,
  isQuiet,
  LOGO,
  renderLogo,
  resolveResultLine,
  setQuietEnabled,
  shouldPrintBanner,
} from './output.js';
import type { ResultBoxContent } from './output.js';

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

describe('agentenv logo', () => {
  it('embeds the wordmark as a stable multi-line constant', () => {
    assert.equal(LOGO.split('\n').length, 6);
    assert.match(LOGO.split('\n')[0], /^ {4}___/);
    assert.match(LOGO.split('\n')[5], /\/____\/$/);
  });

  it('renderLogo() prints the logo on a TTY and stays silent otherwise', () => {
    const originalIsTTY = process.stdout.isTTY;
    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (message?: unknown) => {
      lines.push(String(message));
    };
    try {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      setQuietEnabled(false);
      renderLogo();
      assert.equal(lines.length, 1, 'logo should print on a TTY');
      assert.ok(lines[0].includes(LOGO));

      lines.length = 0;
      Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
      renderLogo();
      assert.equal(lines.length, 0, 'logo should be suppressed when not a TTY');
    } finally {
      console.log = originalLog;
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    }
  });
});

describe('result box', () => {
  it('draws a framed box with the severity glyph, headline and summary', () => {
    const box = formatResultBox({
      severity: 'fail',
      headline: '2 issues found',
      summary: 'run `agentenv apply` to fix',
    });
    assert.ok(box.startsWith('┌'));
    assert.ok(box.endsWith('┘'));
    assert.match(box, /┌─+┐/);
    assert.match(box, /│/);
    assert.match(box, /❌ 2 issues found/);
    assert.match(box, /run `agentenv apply` to fix/);
  });

  it('keeps the glyph per severity', () => {
    assert.match(formatResultBox({ severity: 'ok', headline: 'Done' }), /✅ Done/);
    assert.match(formatResultBox({ severity: 'warn', headline: 'Watch' }), /⚠️ Watch/);
    assert.match(formatResultBox({ severity: 'fail', headline: 'Oops' }), /❌ Oops/);
  });

  it('pads lines to a shared frame width', () => {
    const box = formatResultBox({
      severity: 'ok',
      headline: 'Environment is clean',
      summary: 'everything configured is present',
    });
    const frame = box.split('\n').map((line) => line.length);
    assert.ok(new Set(frame).size === 1, `all rows should share a width, got: ${frame}`);
  });

  it('resolveResultLine() boxes on a TTY and falls back to the plain headline', () => {
    const result: ResultBoxContent = { severity: 'ok', headline: 'Update complete!' };
    assert.equal(resolveResultLine(result, true, false), formatResultBox(result));
    assert.equal(resolveResultLine(result, false, false), 'Update complete!');
    assert.equal(resolveResultLine(result, true, true), 'Update complete!');
  });
});
