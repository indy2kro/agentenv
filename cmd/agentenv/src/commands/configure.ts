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
import { colorizeLine, theme } from '../ui/theme.js';
import { withSpinner } from '../ui/spinner.js';

/**
 * Configure command - Advanced mode wizard
 * Performs step-by-step configuration:
 * 1. Select agents (pre-checked = enabled or detected)
 * 2. Select tools (full Tier 1-3 picker, pre-checked = enabled)
 * 3. Add custom binaries
 * 4. Choose scope (project vs user)
 * 5. Choose rtk enable/disable
 * 6. Optionally opt into Superpowers (the only optional integration today)
 * 7. Diff review screen, then apply
 */
export const configureCommand = new Command()
  .name('configure')
  .description('Re-run configuration wizard (Advanced mode)')
  .action(async () => {
    console.log(theme.heading('\n=== agentenv Configure (Advanced Mode) ===\n'));

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error(
        theme.fail('Configure is interactive; in a non-TTY run `agentenv apply` instead.'),
      );
      process.exitCode = 1;
      return;
    }

    if (!isMiseInstalled()) {
      console.error(
        theme.fail('agentenv requires mise to install and manage tools, but mise was not found.'),
      );
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
    console.log('Step 1/7: Select agents to configure');
    const agents = (await checkbox({
      message: 'Select agents:',
      choices: AGENT_OPTIONS.map((agent) => ({
        name: agent.label,
        value: agent.value,
        checked: existing.agents?.[agent.value] === true || detected.includes(agent.value),
      })),
    })) as AgentKey[];

    // Step 2: Select tools
    console.log('\nStep 2/7: Select tools to install');
    const tools = (await checkbox({
      message: 'Select tools (Tiers 1-3):',
      choices: TOOL_KEYS.map((key) => ({
        name: `${BINARY_MAP[key]} — ${TOOL_DESCRIPTIONS[key]} [Tier ${TOOL_TIERS[key]}]`,
        value: key,
        checked: existing.tools?.[key] === true,
      })),
    })) as string[];

    // Step 3: Add custom binaries
    console.log('\nStep 3/7: Add custom binaries');
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
    console.log('\nStep 4/7: Choose configuration scope');
    const scope = (await select({
      message: 'Scope:',
      choices: [
        { name: `Project-level (this repo: ${process.cwd()})`, value: 'project' },
        { name: 'User/global-level', value: 'user' },
      ],
    })) as 'project' | 'user';

    // Step 5: Enable rtk
    console.log('\nStep 5/7: Token optimization');
    const rtkEnabled = await confirm({
      message: 'Enable rtk command rewriting?',
      default: existing.rtk?.enabled !== false,
    });

    // Step 6: Optional integrations
    console.log('\nStep 6/7: Optional integrations');
    const existingSuperpowers = existing.integrations?.superpowers;
    console.log(
      `  Superpowers (${DEFAULT_CONFIG.integrations?.superpowers?.source}, default ref ${DEFAULT_CONFIG.integrations?.superpowers?.ref}) — currently ${
        existingSuperpowers?.enabled ? 'enabled' : 'disabled'
      }`,
    );
    const wantsSuperpowers = await confirm({
      message:
        'Enable the optional Superpowers integration for Claude Code? (installs a third-party plugin via `claude plugin install`)',
      default: existingSuperpowers?.enabled === true,
    });

    let integrations: AgentenvConfig['integrations'] = existing.integrations;
    if (wantsSuperpowers) {
      const ref = await input({
        message: 'Superpowers ref to pin (tag/branch/commit):',
        default:
          existingSuperpowers?.ref ?? DEFAULT_CONFIG.integrations?.superpowers?.ref ?? 'v6.3.0',
      });
      const allowHooks = await confirm({
        message: 'Allow Superpowers to register its SessionStart hook for Claude Code?',
        default: existingSuperpowers?.allow_hooks === true,
      });
      const allowExternalRequests = await confirm({
        message: 'Allow the optional Superpowers visual companion to make external requests?',
        default: existingSuperpowers?.allow_external_requests === true,
      });
      console.log(
        `  Review: source=github:obra/superpowers, ref=${ref}, scope=${scope}, agents=claude_code, hooks=${allowHooks}, external_requests=${allowExternalRequests}`,
      );
      const confirmIntegration = await confirm({
        message: 'Confirm enabling Superpowers with these settings?',
        default: true,
      });
      integrations = confirmIntegration
        ? {
            superpowers: {
              enabled: true,
              source: 'github:obra/superpowers',
              ref,
              scope,
              agents: ['claude_code'],
              allow_hooks: allowHooks,
              allow_external_requests: allowExternalRequests,
            },
          }
        : existing.integrations;
    } else if (existingSuperpowers?.enabled) {
      integrations = { superpowers: { ...existingSuperpowers, enabled: false } };
    }

    // Step 7: Review
    console.log('\nStep 7/7: Review changes');
    const config = buildConfigFromSelections({
      agents,
      tools,
      customTools,
      scope,
      rtkEnabled,
      integrations,
    });
    const diff = diffConfigs(existing, config);

    console.log('\nConfiguration summary:');
    console.log(`  Agents: ${agents.length > 0 ? agents.join(', ') : '(none)'}`);
    console.log(`  Tools: ${tools.length > 0 ? tools.join(', ') : '(none)'}`);
    console.log(`  Custom tools: ${customTools.length}`);
    console.log(`  Scope: ${scope}`);
    console.log(`  rtk enabled: ${rtkEnabled}`);
    console.log(`  Superpowers: ${integrations?.superpowers?.enabled ? 'enabled' : 'disabled'}`);

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

    const result = await withSpinner('Applying configuration...', () =>
      applyConfiguration(config, resolveScopeDir(scope)),
    );
    for (const message of result.messages) console.log(colorizeLine(message));
    for (const error of result.errors) console.error(theme.fail(error));
    if (!result.success) {
      process.exitCode = 1;
      return;
    }

    console.log(theme.ok('\nConfiguration applied successfully!\n'));
  });
