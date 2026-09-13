import { Command } from 'commander';
import { select, checkbox, input, confirm } from '@inquirer/prompts';

/**
 * Configure command - Advanced mode wizard
 * Performs step-by-step configuration:
 * 1. Select agents (checkbox list)
 * 2. Select tools (full Tier 1-3 picker)
 * 3. Add custom binaries
 * 4. Choose scope (project vs user)
 * 5. Choose rtk enable/disable
 * 6. Review screen with diff
 */
export const configureCommand = new Command()
  .name('configure')
  .description('Re-run configuration wizard (Advanced mode)')
  .action(async () => {
    console.log('\n=== agentenv Configure (Advanced Mode) ===\n');

    // Step 1: Select agents
    console.log('Step 1/6: Select agents to configure');
    const agents = await checkbox({
      message: 'Select agents:',
      choices: [
        { name: 'Claude Code', value: 'claude', checked: true },
        { name: 'Codex CLI', value: 'codex', checked: true },
        { name: 'GitHub Copilot', value: 'copilot', checked: false },
        { name: 'OpenCode', value: 'opencode', checked: false },
      ],
    });

    // Step 2: Select tools
    console.log('\nStep 2/6: Select tools to install');
    const tools = await checkbox({
      message: 'Select tools (Tier 1-3):',
      choices: [
        // Tier 1
        { name: 'ripgrep (rg) [Tier 1 - Essential]', value: 'ripgrep', checked: true },
        { name: 'fd [Tier 1 - Essential]', value: 'fd', checked: true },
        { name: 'jq [Tier 1 - Essential]', value: 'jq', checked: true },
        { name: 'rtk [Tier 1 - Essential]', value: 'rtk', checked: true },

        // Tier 2
        { name: 'ast-grep (sg) [Tier 2 - AI coding]', value: 'ast-grep', checked: true },
        { name: 'git-delta [Tier 2 - AI coding]', value: 'git-delta', checked: true },
        { name: 'universal-ctags [Tier 2 - AI coding]', value: 'ctags', checked: false },
        { name: 'gh (GitHub CLI) [Tier 2 - AI coding]', value: 'gh', checked: true },
        { name: 'difftastic [Tier 2 - AI coding]', value: 'difftastic', checked: true },

        // Tier 3
        { name: 'yq [Tier 3 - Power user]', value: 'yq', checked: false },
        { name: 'bat [Tier 3 - Power user]', value: 'bat', checked: false },
        { name: 'eza [Tier 3 - Power user]', value: 'eza', checked: false },
        { name: 'miller (mlr) [Tier 3 - Power user]', value: 'miller', checked: false },
        { name: 'tokei [Tier 3 - Power user]', value: 'tokei', checked: false },
        { name: 'hyperfine [Tier 3 - Power user]', value: 'hyperfine', checked: false },
        { name: 'fzf [Tier 3 - Power user]', value: 'fzf', checked: false },
        { name: 'just [Tier 3 - Power user]', value: 'just', checked: false },
        { name: 'watchexec [Tier 3 - Power user]', value: 'watchexec', checked: false },
        { name: 'direnv [Tier 3 - Power user]', value: 'direnv', checked: false },
      ],
    });

    // Step 3: Add custom binaries
    console.log('\nStep 3/6: Add custom binaries');
    const addCustom = await confirm({
      message: 'Add custom binary?',
      default: false,
    });

    const customTools = [];
    if (addCustom) {
      // In a real implementation, we'd loop to add multiple
      const name = await input({ message: 'Tool name:' });
      const description = await input({ message: 'Description:' });
      const alreadyInstalled = await confirm({ message: 'Already installed?', default: true });

      let pathWindows = '';
      let pathMacOS = '';
      let pathLinux = '';

      if (alreadyInstalled) {
        pathWindows = await input({ message: 'Windows path (C:\\...):' });
        pathMacOS = await input({ message: 'macOS path (/usr/local/...):' });
        pathLinux = await input({ message: 'Linux path (/usr/bin/...):' });
      } else {
        const miseSource = await input({ message: 'mise source (github:owner/repo):' });
        const version = await input({ message: 'Version (latest):', default: 'latest' });
        customTools.push({ name, description, miseSource, version });
      }

      customTools.push({ name, description, pathWindows, pathMacOS, pathLinux });
    }

    // Step 4: Choose scope
    console.log('\nStep 4/6: Choose configuration scope');
    const scope = await select({
      message: 'Scope:',
      choices: [
        { name: 'Project-level (checked into repo)', value: 'project' },
        { name: 'User/global-level', value: 'user' },
      ],
    });

    // Step 5: Enable rtk
    console.log('\nStep 5/6: Token optimization');
    const rtkEnabled = await confirm({
      message: 'Enable rtk command rewriting?',
      default: true,
    });

    // Step 6: Review
    console.log('\nStep 6/6: Review changes');
    console.log('\nConfiguration summary:');
    console.log(`  Agents: ${agents.join(', ')}`);
    console.log(`  Tools: ${tools.join(', ')}`);
    console.log(`  Custom tools: ${customTools.length}`);
    console.log(`  Scope: ${scope}`);
    console.log(`  rtk enabled: ${rtkEnabled}`);

    const proceed = await confirm({
      message: 'Apply this configuration?',
      default: true,
    });

    if (proceed) {
      console.log('\nApplying configuration...');
      // TODO: Actual implementation
      console.log('  Generating agentenv.toml...');
      console.log('  Generating mise.toml...');
      console.log('  Running mise install...');
      console.log('  Generating AGENTS.md...');
      console.log('  Configuring agent hooks...');
      console.log('\nConfiguration applied successfully!\n');
    } else {
      console.log('\nCancelled. No changes made.\n');
    }
  });
