#!/usr/bin/env node

/**
 * agentenv CLI - Main entrypoint
 * Configure a consistent, capable shell environment for AI coding agents
 */

import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { configureCommand } from './commands/configure.js';
import { applyCommand } from './commands/apply.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';

// Create the CLI
const program = new Command();

program
  .name('agentenv')
  .description('Configure a consistent, capable shell environment for AI coding agents')
  .version('0.1.0');

// Add commands
program.addCommand(setupCommand);
program.addCommand(configureCommand);
program.addCommand(applyCommand);
program.addCommand(statusCommand);
program.addCommand(updateCommand);

// Parse and execute
program.parse(process.argv);
