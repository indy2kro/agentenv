#!/usr/bin/env node

/**
 * agentenv CLI - Main entrypoint
 * Configure a consistent, capable shell environment for AI coding agents
 */

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { configureCommand } from './commands/configure.js';
import { applyCommand } from './commands/apply.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { doctorCommand } from './commands/doctor.js';
import { setColorEnabled } from './ui/theme.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

// Create the CLI
const program = new Command();

program
  .name('agentenv')
  .description('Configure a consistent, capable shell environment for AI coding agents')
  .version(version)
  .option('--no-color', 'disable colored output (also honors the NO_COLOR env var)');

// Color auto-detects from TTY + NO_COLOR/FORCE_COLOR by default (chalk);
// --no-color is the only explicit override, checked before any command runs.
program.hook('preAction', (_thisCommand, actionCommand) => {
  const { color } = actionCommand.optsWithGlobals<{ color?: boolean }>();
  if (color === false) setColorEnabled(false);
});

// Add commands
program.addCommand(setupCommand);
program.addCommand(configureCommand);
program.addCommand(applyCommand);
program.addCommand(statusCommand);
program.addCommand(updateCommand);
program.addCommand(doctorCommand);

// Parse and execute
program.parse(process.argv);
