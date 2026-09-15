import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import { colorizeLine, setColorEnabled, theme } from './theme.js';

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
});
