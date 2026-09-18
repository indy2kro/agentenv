import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command, CommanderError } from 'commander';
import { exitCodeForCommanderError, installExitOverride } from './exit.js';

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

describe('installExitOverride', () => {
  it('applies the 0/2 contract to a command added after the override installs', async () => {
    const program = new Command('agentenv');
    installExitOverride(program);
    program
      .command('future')
      .requiredOption('--must <v>', 'required value')
      .description('a command registered after installExitOverride');

    const saved = process.exitCode;
    process.exitCode = undefined;
    await assert.rejects(
      program.parseAsync(['node', 'agentenv', 'future']),
      (error) =>
        error instanceof CommanderError && error.code === 'commander.missingMandatoryOptionValue',
    );
    assert.equal(process.exitCode, 2);
    process.exitCode = saved;
  });

  it('maps help on a late-added command to exit 0', async () => {
    const program = new Command('agentenv');
    installExitOverride(program);
    program.command('late').description('registered later');

    const saved = process.exitCode;
    process.exitCode = undefined;
    await assert.rejects(
      program.parseAsync(['node', 'agentenv', 'late', '--help']),
      (error) => error instanceof CommanderError && error.code === 'commander.helpDisplayed',
    );
    assert.equal(process.exitCode, 0);
    process.exitCode = saved;
  });
});
