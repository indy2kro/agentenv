import { checkbox, confirm, input, select, Separator } from '@inquirer/prompts';
import { detectInstalledAgents } from '../adapters/detect.js';
import { DEFAULT_CONFIG, diffConfigs, loadConfig } from '../config/schema.js';
import type { AgentKey, AgentenvConfig, CustomTool } from '../config/schema.js';
import { configFilePath, findConfigPath } from '../config/scopes.js';
import { saveAndApply } from './setup.js';
import {
  AGENT_OPTIONS,
  buildConfigFromSelections,
  formatDiffLines,
  missingCustomToolPaths,
  promptPageSize,
  shouldPreCheckAgent,
  toolChoices,
} from '../wizard/build.js';
import {
  getMiseVersion,
  isMiseInstalled,
  miseInstallInstructions,
  prereqLine,
} from '../toolchain/mise.js';
import { theme } from '../ui/theme.js';
import { renderLogo, resolveResultLine } from '../ui/output.js';

/**
 * Shared interactive setup wizard — the single flow behind `agentenv setup`
 * and the `configure` alias:
 *   1. agents -> 2. tools (all tiers, one page, no wrap) -> 3. custom binaries
 *   -> 4. scope -> 5. rtk -> 6. Superpowers -> 7. diff review -> apply
 */
export async function runConfigWizard(): Promise<void> {
  renderLogo();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      theme.fail(
        'Setup is interactive; in a non-TTY run `agentenv setup --yes` or `agentenv apply`.',
      ),
    );
    process.exitCode = 1;
    return;
  }

  if (!isMiseInstalled()) {
    console.error(
      theme.fail('agentenv requires mise to install and manage tools, but mise was not found.'),
    );
    for (const line of miseInstallInstructions()) console.error(`  ${line}`);
    console.error('\nInstall mise first, then re-run `agentenv setup`.');
    process.exitCode = 1;
    return;
  }
  console.log(`${prereqLine(getMiseVersion())}\n`);

  let existing: AgentenvConfig;
  try {
    existing = loadConfig();
  } catch {
    existing = DEFAULT_CONFIG;
  }
  const hasExistingConfig = findConfigPath() !== undefined;
  const detected = detectInstalledAgents();

  // Step 1: Select agents (pre-checked = already enabled or detected; one page; no wrap).
  console.log('Step 1/7: Select agents to configure');
  const agents = (await checkbox({
    message: 'Select agents:',
    pageSize: promptPageSize(AGENT_OPTIONS.length, process.stdout.rows),
    loop: false,
    choices: AGENT_OPTIONS.map((agent) => ({
      name: agent.label,
      value: agent.value,
      checked: shouldPreCheckAgent(existing, detected, agent.value, hasExistingConfig),
    })),
  })) as AgentKey[];

  // Step 2: Select tools — all tiers in one list, every tool on one page when
  // the terminal allows, and navigation that stops instead of wrapping.
  console.log('\nStep 2/7: Select tools to install');
  const toolEntries = toolChoices(existing);
  const tools = (await checkbox({
    message: 'Select tools (Tiers 1-3):',
    pageSize: promptPageSize(toolEntries.length, process.stdout.rows),
    loop: false,
    choices: toolEntries.map((entry) =>
      entry.type === 'separator' ? new Separator(entry.line) : entry,
    ),
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
      for (;;) {
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
        const missing = missingCustomToolPaths({
          path_windows: pathWindows,
          path_macos: pathMacOS,
          path_linux: pathLinux,
        });
        if (missing.length === 0) {
          customTools.push({
            name,
            description,
            already_installed: true,
            path_windows: pathWindows,
            path_macos: pathMacOS,
            path_linux: pathLinux,
          });
          break;
        }
        console.log(theme.warn(`  Path(s) not found on this machine: ${missing.join(', ')}`));
        const retry = await confirm({
          message: 'Re-enter the paths, or keep them anyway? (they may exist on the target OS)',
          default: true,
        });
        if (!retry) {
          customTools.push({
            name,
            description,
            already_installed: true,
            path_windows: pathWindows,
            path_macos: pathMacOS,
            path_linux: pathLinux,
          });
          break;
        }
      }
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
    console.log('\n  Superpowers — enabling this installs a third-party Claude Code plugin:');
    console.log(
      `    - source: github:obra/superpowers, default ref ${DEFAULT_CONFIG.integrations?.superpowers?.ref ?? 'latest'}`,
    );
    console.log('    - it can register a SessionStart hook in the Claude Code setup');
    console.log('    - the optional visual companion can make external requests');
    console.log('  The next prompts pin the ref and the two permissions below.\n');
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
    console.log(
      `\n${resolveResultLine({ severity: 'warn', headline: 'Cancelled', summary: 'No changes were made' })}\n`,
    );
    return;
  }

  const file = configFilePath(scope);
  await saveAndApply(config, file, { successMessage: 'Configuration applied successfully!' });
}
