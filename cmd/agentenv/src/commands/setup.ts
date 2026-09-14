import { Command } from 'commander';
import { checkbox, confirm, select } from '@inquirer/prompts';
import { detectInstalledAgents } from '../adapters/detect.js';
import { saveConfig } from '../config/schema.js';
import type { AgentKey } from '../config/schema.js';
import { configFilePath, resolveScopeDir } from '../config/scopes.js';
import { applyConfiguration } from './apply.js';
import { AGENT_OPTIONS, buildConfigFromSelections, simpleToolSelection } from '../wizard/build.js';

function agentLabel(agent: AgentKey): string {
  return AGENT_OPTIONS.find((option) => option.value === agent)?.label ?? agent;
}

/**
 * Setup command - Interactive Simple mode wizard
 * Performs:
 * - Auto-detect installed agents
 * - Install Tier 1 (and Tier 2 unless declined)
 * - Wire hooks for the selected agents
 * - Apply everything (incl. Tier 0 shell fix)
 */
export const setupCommand = new Command()
  .name('setup')
  .description('Interactive setup wizard (Simple mode)')
  .action(async () => {
    console.log('\n=== agentenv Setup (Simple Mode) ===\n');

    const detected = detectInstalledAgents();
    console.log(
      detected.length > 0
        ? `Detected agents: ${detected.map(agentLabel).join(', ')}`
        : 'No agents detected on PATH (you can still select agents to configure)',
    );

    const selectedAgents = (await checkbox({
      message: 'Select agents to configure:',
      choices: AGENT_OPTIONS.map((agent) => ({
        name: agent.label,
        value: agent.value,
        checked: detected.includes(agent.value),
      })),
    })) as AgentKey[];

    if (selectedAgents.length === 0) {
      console.log('No agents selected; nothing to configure.');
      process.exitCode = 1;
      return;
    }

    const installTier2 = await confirm({
      message: 'Install Tier 2 tools (AI-coding value-add: ast-grep, git-delta, gh, difftastic)?',
      default: true,
    });

    const scope = (await select({
      message: 'Where should the configuration live?',
      choices: [
        { name: `Project-level (this repo: ${process.cwd()})`, value: 'project' },
        { name: 'User/global-level', value: 'user' },
      ],
    })) as 'project' | 'user';

    const config = buildConfigFromSelections({
      agents: selectedAgents,
      tools: simpleToolSelection(installTier2),
      customTools: [],
      scope,
      rtkEnabled: true,
    });

    const file = configFilePath(scope);
    saveConfig(config, file);
    console.log(`Saved configuration: ${file}\n`);

    const result = await applyConfiguration(config, resolveScopeDir(scope));
    for (const message of result.messages) console.log(message);
    for (const error of result.errors) console.error(error);
    if (!result.success) {
      process.exitCode = 1;
      return;
    }

    console.log('\nSetup complete!\n');
  });
