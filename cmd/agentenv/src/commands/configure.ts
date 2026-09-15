import { Command } from 'commander';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import { detectInstalledAgents } from '../adapters/detect.js';
import {
  BINARY_MAP,
  DEFAULT_CONFIG,
  TOOL_DESCRIPTIONS,
  TOOL_KEYS,
  TOOL_TIERS,
  diffConfigs,
  loadConfig,
  saveConfig,
} from '../config/schema.js';
import type { AgentKey, AgentenvConfig, CustomTool } from '../config/schema.js';
import { configFilePath, resolveScopeDir } from '../config/scopes.js';
import { applyConfiguration } from './apply.js';
import { AGENT_OPTIONS, buildConfigFromSelections, formatDiffLines } from '../wizard/build.js';
import { getMiseVersion, isMiseInstalled, miseInstallInstructions } from '../toolchain/mise.js';

/**
 * Configure command - Advanced mode wizard
 * Performs step-by-step configuration:
 * 1. Select agents (pre-checked = enabled or detected)
 * 2. Select tools (full Tier 1-3 picker, pre-checked = enabled)
 * 3. Add custom binaries
 * 4. Choose scope (project vs user)
 * 5. Choose rtk enable/disable
 * 6. Diff review screen, then apply
 */
export const configureCommand = new Command()
  .name('configure')
  .description('Re-run configuration wizard (Advanced mode)')
  .action(async () => {
    console.log('\n=== agentenv Configure (Advanced Mode) ===\n');

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('Configure is interactive; in a non-TTY run `agentenv apply` instead.');
      process.exitCode = 1;
      return;
    }

    if (!isMiseInstalled()) {
      console.error('agentenv requires mise to install and manage tools, but mise was not found.');
      for (const line of miseInstallInstructions()) console.error(`  ${line}`);
      console.error('\nInstall mise first, then re-run `agentenv configure`.');
      process.exitCode = 1;
      return;
    }
    console.log(`Prerequisite: mise ${getMiseVersion()}\n`);

    let existing: AgentenvConfig;
    try {
      existing = loadConfig();
    } catch {
      existing = DEFAULT_CONFIG;
    }
    const detected = detectInstalledAgents();

    // Step 1: Select agents
    console.log('Step 1/6: Select agents to configure');
    const agents = (await checkbox({
      message: 'Select agents:',
      choices: AGENT_OPTIONS.map((agent) => ({
        name: agent.label,
        value: agent.value,
        checked: existing.agents?.[agent.value] === true || detected.includes(agent.value),
      })),
    })) as AgentKey[];

    // Step 2: Select tools
    console.log('\nStep 2/6: Select tools to install');
    const tools = (await checkbox({
      message: 'Select tools (Tiers 1-3):',
      choices: TOOL_KEYS.map((key) => ({
        name: `${BINARY_MAP[key]} — ${TOOL_DESCRIPTIONS[key]} [Tier ${TOOL_TIERS[key]}]`,
        value: key,
        checked: existing.tools?.[key] === true,
      })),
    })) as string[];

    // Step 3: Add custom binaries
    console.log('\nStep 3/6: Add custom binaries');
    const customTools: CustomTool[] = [];
    let addCustom = await confirm({ message: 'Add a custom binary?', default: false });
    while (addCustom) {
      const name = await input({ message: 'Tool name (e.g. "my-tool"):' });
      const description = await input({ message: 'Description (optional):', default: '' });
      const alreadyInstalled = await confirm({ message: 'Already installed?', default: true });

      if (alreadyInstalled) {
        const pathWindows = await input({
          message: 'Windows path (e.g. C:\\tools\\my-tool.exe):',
          default: '',
        });
        const pathMacOS = await input({
          message: 'macOS path (e.g. /usr/local/bin/my-tool):',
          default: '',
        });
        const pathLinux = await input({
          message: 'Linux path (e.g. /usr/bin/my-tool):',
          default: '',
        });
        customTools.push({
          name,
          description,
          already_installed: true,
          path_windows: pathWindows,
          path_macos: pathMacOS,
          path_linux: pathLinux,
        });
      } else {
        const miseSource = await input({ message: 'mise source (e.g. github:owner/repo):' });
        const version = await input({ message: 'Version (default: latest):', default: 'latest' });
        customTools.push({
          name,
          description,
          already_installed: false,
          mise_source: miseSource,
          version,
        });
      }

      addCustom = await confirm({ message: 'Add another custom binary?', default: false });
    }

    // Step 4: Choose scope
    console.log('\nStep 4/6: Choose configuration scope');
    const scope = (await select({
      message: 'Scope:',
      choices: [
        { name: `Project-level (this repo: ${process.cwd()})`, value: 'project' },
        { name: 'User/global-level', value: 'user' },
      ],
    })) as 'project' | 'user';

    // Step 5: Enable rtk
    console.log('\nStep 5/6: Token optimization');
    const rtkEnabled = await confirm({
      message: 'Enable rtk command rewriting?',
      default: existing.rtk?.enabled !== false,
    });

    // Step 6: Review
    console.log('\nStep 6/6: Review changes');
    const config = buildConfigFromSelections({ agents, tools, customTools, scope, rtkEnabled });
    const diff = diffConfigs(existing, config);

    console.log('\nConfiguration summary:');
    console.log(`  Agents: ${agents.length > 0 ? agents.join(', ') : '(none)'}`);
    console.log(`  Tools: ${tools.length > 0 ? tools.join(', ') : '(none)'}`);
    console.log(`  Custom tools: ${customTools.length}`);
    console.log(`  Scope: ${scope}`);
    console.log(`  rtk enabled: ${rtkEnabled}`);

    if (diff.length === 0) {
      console.log('\nNo changes from the current configuration.');
    } else {
      console.log('\nChanges vs. current configuration:');
      for (const line of formatDiffLines(diff)) console.log(`  ${line}`);
    }

    const proceed = await confirm({ message: 'Apply this configuration?', default: true });
    if (!proceed) {
      console.log('\nCancelled. No changes made.\n');
      return;
    }

    const file = configFilePath(scope);
    saveConfig(config, file);
    console.log(`\nSaved configuration: ${file}`);

    const result = await applyConfiguration(config, resolveScopeDir(scope));
    for (const message of result.messages) console.log(message);
    for (const error of result.errors) console.error(error);
    if (!result.success) {
      process.exitCode = 1;
      return;
    }

    console.log('\nConfiguration applied successfully!\n');
  });
