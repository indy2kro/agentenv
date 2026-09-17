import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommanderError } from 'commander';
import { exitCodeForCommanderError } from './exit.js';

describe('exitCodeForCommanderError', () => {
  it('maps help and version to 0', () => {
    for (const code of ['commander.helpDisplayed', 'commander.help', 'commander.version']) {
      assert.equal(exitCodeForCommanderError(new CommanderError(0, code, 'x')), 0);
    }
  });

  it('maps every usage error to 2', () => {
    for (const code of [
      'commander.unknownOption',
      'commander.unknownCommand',
      'commander.missingArgument',
      'commander.optionMissingArgument',
      'commander.missingMandatoryOptionValue',
      'commander.invalidArgument',
    ]) {
      assert.equal(exitCodeForCommanderError(new CommanderError(1, code, 'x')), 2);
    }
  });
});
