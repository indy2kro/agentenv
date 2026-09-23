import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import {
  colorizeLine,
  failGlyph,
  resetAsciiGlyphsCache,
  setColorEnabled,
  successGlyph,
  theme,
  unsupportedGlyph,
  useAsciiGlyphs,
} from './theme.js';

describe('theme', () => {
  it('setColorEnabled(false) forces chalk.level to 0', () => {
    const original = chalk.level;
    try {
      chalk.level = 3;
      setColorEnabled(false);
      assert.equal(chalk.level, 0);
    } finally {
      chalk.level = original;
    }
  });

  it('setColorEnabled(true) leaves the current (auto-detected) level untouched', () => {
    const original = chalk.level;
    try {
      chalk.level = 2;
      setColorEnabled(true);
      assert.equal(chalk.level, 2);
    } finally {
      chalk.level = original;
    }
  });

  it('theme helpers colorize text when color is enabled', () => {
    const original = chalk.level;
    try {
      chalk.level = 1;
      assert.equal(theme.ok('yes'), chalk.green('yes'));
      assert.equal(theme.fail('no'), chalk.red('no'));
      assert.equal(theme.warn('careful'), chalk.yellow('careful'));
      assert.equal(theme.dim('quiet'), chalk.dim('quiet'));
      assert.equal(theme.bold('loud'), chalk.bold('loud'));
      assert.equal(theme.heading('Section'), chalk.bold.cyan('Section'));
    } finally {
      chalk.level = original;
    }
  });

  it('theme helpers return plain text when color is disabled', () => {
    const original = chalk.level;
    try {
      chalk.level = 0;
      assert.equal(theme.ok('yes'), 'yes');
      assert.equal(theme.fail('no'), 'no');
      assert.equal(theme.heading('Section'), 'Section');
    } finally {
      chalk.level = original;
    }
  });

  it('colorizeLine wraps a line by its leading status glyph', () => {
    const original = chalk.level;
    try {
      chalk.level = 1;
      assert.equal(colorizeLine('  ✓ rg (ripgrep)'), chalk.green('  ✓ rg (ripgrep)'));
      assert.equal(colorizeLine('  ✗ missing'), chalk.red('  ✗ missing'));
      assert.equal(colorizeLine('  · unsupported'), chalk.dim('  · unsupported'));
      assert.equal(colorizeLine('warning: floating ref'), chalk.yellow('warning: floating ref'));
      assert.equal(colorizeLine('  !  drifted'), chalk.yellow('  !  drifted'));
      assert.equal(colorizeLine('plain informational line'), 'plain informational line');
    } finally {
      chalk.level = original;
    }
  });

  it('colorizeLine also recognizes the ASCII-fallback glyph forms', () => {
    const original = chalk.level;
    try {
      chalk.level = 1;
      assert.equal(colorizeLine('  [ok] rg (ripgrep)'), chalk.green('  [ok] rg (ripgrep)'));
      assert.equal(colorizeLine('  [FAIL] missing'), chalk.red('  [FAIL] missing'));
      assert.equal(colorizeLine('  [-] unsupported'), chalk.dim('  [-] unsupported'));
    } finally {
      chalk.level = original;
    }
  });
});

describe('useAsciiGlyphs', () => {
  it('forces ASCII when AGENTENV_ASCII=1/true is set, regardless of TERM/platform', () => {
    assert.equal(useAsciiGlyphs({ forceAscii: '1', term: 'xterm', platform: 'darwin' }), true);
    assert.equal(useAsciiGlyphs({ forceAscii: 'true', term: 'xterm', platform: 'darwin' }), true);
  });

  it('forces Unicode when AGENTENV_ASCII=0/false is set, even under TERM=dumb', () => {
    assert.equal(useAsciiGlyphs({ forceAscii: '0', term: 'dumb' }), false);
    assert.equal(useAsciiGlyphs({ forceAscii: 'false', term: 'dumb' }), false);
  });

  it('is true under TERM=dumb with no override', () => {
    assert.equal(useAsciiGlyphs({ term: 'dumb', platform: 'darwin' }), true);
  });

  it('is false on a non-Windows platform with a normal TERM', () => {
    assert.equal(useAsciiGlyphs({ term: 'xterm-256color', platform: 'darwin' }), false);
  });

  it('is true on Windows when the active code page is not 65001', () => {
    assert.equal(
      useAsciiGlyphs({ platform: 'win32', term: 'xterm', getWindowsCodePage: () => 437 }),
      true,
    );
  });

  it('is false on Windows when the active code page is 65001 (UTF-8)', () => {
    assert.equal(
      useAsciiGlyphs({ platform: 'win32', term: 'xterm', getWindowsCodePage: () => 65001 }),
      false,
    );
  });

  it('is false on Windows when the code page cannot be determined', () => {
    assert.equal(
      useAsciiGlyphs({ platform: 'win32', term: 'xterm', getWindowsCodePage: () => undefined }),
      false,
    );
  });
});

describe('glyph getters (AGENTENV_ASCII override)', () => {
  it('successGlyph/failGlyph/unsupportedGlyph switch forms with the cached env probe', () => {
    const original = process.env.AGENTENV_ASCII;
    try {
      process.env.AGENTENV_ASCII = '1';
      resetAsciiGlyphsCache();
      assert.equal(successGlyph(), '[ok]');
      assert.equal(failGlyph(), '[FAIL]');
      assert.equal(unsupportedGlyph(), '[-]');

      process.env.AGENTENV_ASCII = '0';
      resetAsciiGlyphsCache();
      assert.equal(successGlyph(), '✓');
      assert.equal(failGlyph(), '✗');
      assert.equal(unsupportedGlyph(), '·');
    } finally {
      if (original === undefined) delete process.env.AGENTENV_ASCII;
      else process.env.AGENTENV_ASCII = original;
      resetAsciiGlyphsCache();
    }
  });
});
