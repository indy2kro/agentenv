import type { Command, CommanderError } from 'commander';

/**
 * Usage errors (unknown option/command, missing required argument, bad value)
 * must exit 2; help/version are successful informational exits (0).
 */
export function exitCodeForCommanderError(error: CommanderError): 0 | 2 {
  switch (error.code) {
    case 'commander.helpDisplayed':
    case 'commander.help':
    case 'commander.version':
      return 0;
    default:
      return 2;
  }
}

/**
 * Install the usage-error exit-code contract on a program and every registered
 * or future subcommand. MUST be called *after* `addCommand` for the program's
 * own override, and it subscribes to commander's `command:add` so any command
 * registered later (e.g. by an extension or a future release) inherits the
 * same contract instead of silently falling back to `process.exit(1)`. The
 * callback MUST rethrow: commander's `error()` calls `process.exit(1)`
 * immediately after the override returns normally, which would clobber the
 * mapped code. Rethrowing lets `parseAsync()`'s rejection carry the error out
 * to the entrypoint, which then honors the already-set `process.exitCode`.
 */
export function installExitOverride(program: Command): void {
  const override = (error: CommanderError): void => {
    process.exitCode = exitCodeForCommanderError(error);
    throw error;
  };
  program.exitOverride(override);
  program.on('command:add', (command: Command) => command.exitOverride(override));
  for (const command of program.commands) command.exitOverride(override);
}
