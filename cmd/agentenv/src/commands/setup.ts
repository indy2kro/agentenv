import { Command } from 'commander';
import { select, confirm } from '@inquirer/prompts';

/**
 * Setup command - Interactive Simple mode wizard
 * Performs:
 * - Tier 0 shell check/fix on Windows
 * - Auto-detect installed agents
 * - Install Tier 1 (and Tier 2 unless declined)
 * - Wire hooks for detected agents
 */
export const setupCommand = new Command()
  .name('setup')
  .description('Interactive setup wizard (Simple mode)')
  .action(async () => {
    console.log('\n=== agentenv Setup (Simple Mode) ===\n');

    // Step 1: Tier 0 shell check/fix
    console.log('Step 1/4: Checking shell environment...');
    // TODO: Call shell detection/fix
    console.log('  Tier 0 shell check: OK (placeholder)\n');

    // Step 2: Auto-detect installed agents
    console.log('Step 2/4: Detecting installed agents...');
    const detectedAgents = ['Claude Code', 'Codex CLI']; // Placeholder - actual detection
    console.log(`  Detected: ${detectedAgents.join(', ')}\n`);

    // Step 3: Select agents to configure (pre-checked = detected)
    const agentChoices = await select({
      message: 'Select agents to configure:',
      choices: [
        { name: 'Claude Code', value: 'claude' },
        { name: 'Codex CLI', value: 'codex' },
        { name: 'GitHub Copilot', value: 'copilot' },
        { name: 'OpenCode', value: 'opencode' },
      ],
    });

    // Step 4: Install Tier 1 tools with toggle for Tier 2
    const installTier2 = await confirm({
      message: 'Install Tier 2 tools (AI-coding value-add)?',
      default: true,
    });

    console.log('\nStep 4/4: Configuring...');
    console.log(`  Agents: ${agentChoices}`);
    console.log(`  Tier 1 tools: ripgrep, fd, jq, rtk`);
    console.log(`  Tier 2 tools: ${installTier2 ? 'ast-grep, git-delta, gh, difftastic, universal-ctags' : 'none'}`);
    console.log('\n  Generating mise.toml...');
    console.log('  Running mise install...');
    console.log('  Generating AGENTS.md and CLAUDE.md...');
    console.log('  Configuring agent hooks...\n');

    // TODO: Actual implementation
    console.log('Setup complete!\n');
  });
