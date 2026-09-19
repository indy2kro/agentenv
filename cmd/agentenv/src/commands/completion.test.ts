import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import {
  COMPLETION_SHELLS,
  buildCompletionModel,
  generateBash,
  generateFish,
  generatePowerShell,
  generateZsh,
  generateCompletion,
} from './completion.js';

function fixtureProgram(): Command {
  const program = new Command();
  program
    .name('agentenv')
    .option('--no-color', 'disable colored output')
    .option('-q, --quiet', 'suppress banner/footer chrome')
    .option('--debug', 'print the failing command and stack trace');
  program
    .command('setup')
    .alias('s')
    .description('Set up agentenv for a project')
    .option('--agents <list>', 'agents to enable');
  program
    .command('apply')
    .description('Apply the configuration')
    .option('--dry-run', 'preview without writing');
  program
    .command('completion')
    .description('generate a shell completion script')
    .argument('<shell>');
  return program;
}

describe('completion model', () => {
  it('introspects every registered command, alias and flag', () => {
    const model = buildCompletionModel(fixtureProgram());
    assert.equal(model.program, 'agentenv');
    assert.deepEqual(
      model.commands.map((command) => command.name),
      ['setup', 'apply', 'completion'],
    );
    const setup = model.commands[0];
    assert.deepEqual(setup.aliases, ['s']);
    assert.equal(setup.description, 'Set up agentenv for a project');
    // The command's own flag plus every program-level global.
    for (const flag of ['--agents', '--no-color', '-q', '--quiet', '--debug', '--help']) {
      assert.ok(setup.flags.includes(flag), `setup flags should include ${flag}`);
    }
  });

  it('offers a script for every supported shell', () => {
    const model = buildCompletionModel(fixtureProgram());
    for (const shell of COMPLETION_SHELLS) {
      const script = generateCompletion(shell, model);
      assert.ok(script.length > 0, `${shell} script should not be empty`);
      for (const word of ['agentenv', 'setup', 's', 'apply', 'completion']) {
        assert.ok(script.includes(word), `${shell} script should mention ${word}`);
      }
    }
  });

  it('emits shell-native syntax for each shell', () => {
    const model = buildCompletionModel(fixtureProgram());
    assert.match(generateBash(model), /^#!\/usr\/bin\/env bash/);
    assert.match(generateBash(model), /complete -F _agentenv_completions agentenv/);
    assert.match(generateBash(model), /--dry-run/);
    assert.match(generateZsh(model), /^#compdef agentenv/);
    assert.match(generateZsh(model), /_describe -t commands/);
    assert.match(generateFish(model), /complete -c agentenv/);
    assert.match(generateFish(model), /-l dry-run/);
    assert.match(generateFish(model), /-s q/);
    assert.match(
      generatePowerShell(model),
      /Register-ArgumentCompleter -Native -CommandName 'agentenv'/,
    );
    assert.match(generatePowerShell(model), /'--dry-run'/);
  });

  it('offers the supported shell names after `completion`', () => {
    const model = buildCompletionModel(fixtureProgram());
    const bash = generateBash(model);
    assert.match(bash, /completion[\s\S]*bash zsh fish powershell/);
  });

  it('completes the completion argument for zsh, fish, and powershell too', () => {
    const model = buildCompletionModel(fixtureProgram());
    const zsh = generateZsh(model);
    assert.match(zsh, /_describe -t shells/);
    for (const shell of COMPLETION_SHELLS) {
      assert.ok(zsh.includes(`'${shell}:${shell}'`), `zsh should complete ${shell}`);
    }
    assert.match(generateFish(model), /bash zsh fish powershell/);
    assert.match(generatePowerShell(model), /'bash', 'zsh', 'fish', 'powershell'/);
  });
});
