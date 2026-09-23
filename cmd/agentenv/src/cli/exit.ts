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
 * Install the usage-error exit-code contract on a program and every command
 * already registered on it. MUST be called *after* every `addCommand()`, so
 * the explicit loop below reaches them all. A command registered later via
 * `.command(name)` (not `.addCommand()`) inherits it automatically —
 * Commander's own `copyInheritedSettings()` copies the parent's exit
 * callback onto it at creation time.
 *
 * This deliberately does NOT also listen for a `'command:add'` event: no
 * such registration event exists in Commander. That string is only ever
 * emitted as the *legacy* per-command completion event `command:${name}` —
 * fired on the parent after a subcommand's action handler runs, with
 * `(operands, unknown)` as its arguments — so a listener bound to the
 * literal name `'command:add'` would silently misfire as soon as any
 * command were named "add", handing `command.exitOverride()` an array
 * instead of a Command and crashing every run of it.
 *
 * The callback MUST rethrow: commander's `error()` calls `process.exit(1)`
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
