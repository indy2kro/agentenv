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
 * Install the usage-error exit-code contract on a program and every already
 * registered subcommand. MUST be called *after* `addCommand` (commander does
 * not propagate an exit callback to `addCommand`-registered children), and the
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
  for (const command of program.commands) command.exitOverride(override);
}
