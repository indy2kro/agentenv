#!/usr/bin/env node

/**
 * agentenv CLI - Main entrypoint
 * Configure a consistent, capable shell environment for AI coding agents
 */

import { readFileSync } from 'node:fs';
import { Command, CommanderError } from 'commander';
import { setupCommand } from './commands/setup.js';
import { applyCommand } from './commands/apply.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { doctorCommand } from './commands/doctor.js';
import { setColorEnabled } from './ui/theme.js';
import { setQuietEnabled } from './ui/output.js';
import { installExitOverride } from './cli/exit.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

// Create the CLI
const program = new Command();

program
  .name('agentenv')
  .description('Configure a consistent, capable shell environment for AI coding agents')
  .version(version)
  .option('--no-color', 'disable colored output (also honors the NO_COLOR env var)')
  .option('-q, --quiet', 'suppress banner/footer chrome (data lines are kept)');

// Color auto-detects from TTY + NO_COLOR/FORCE_COLOR by default (chalk);
// --no-color and -q are explicit overrides, applied before any command runs.
program.hook('preAction', (_thisCommand, actionCommand) => {
  const { color, quiet } = actionCommand.optsWithGlobals<{ color?: boolean; quiet?: boolean }>();
  if (color === false) setColorEnabled(false);
  setQuietEnabled(quiet === true);
});

// Add commands
program.addCommand(setupCommand);
program.addCommand(applyCommand);
program.addCommand(statusCommand);
program.addCommand(updateCommand);
program.addCommand(doctorCommand);

// After addCommand, so the override is installed on every subcommand too.
installExitOverride(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  // The override rethrew a CommanderError after setting process.exitCode
  // (0 for help/version, 2 for usage errors); nothing more to do.
  if (error instanceof CommanderError) return;
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
