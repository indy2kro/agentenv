import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodexCliAdapter } from './codex.js';
import { CopilotAdapter } from './copilot.js';
import { OpenCodeAdapter } from './opencode.js';

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-adapter-'));
}

function withHome(home: string, run: () => Promise<void>): Promise<void> {
  const priorHome = process.env.HOME;
  process.env.HOME = home;
  return run().finally(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
  });
}

describe('Codex CLI adapter', () => {
  it('creates config.toml and the rtk hooks.json when rtk is enabled', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const adapter = new CodexCliAdapter({ enabled: true, baseDir: home, rtkEnabled: true });
      const result = await adapter.initialize();

      const configPath = path.join(home, '.codex', 'config.toml');
      const configContent = fs.readFileSync(configPath, 'utf8');
      assert.equal(result.success, true);
      assert.match(configContent, /\[features\]/);
      assert.match(configContent, /hooks = true/);

      const hooksContent = fs.readFileSync(path.join(home, '.codex', 'hooks.json'), 'utf8');
      const hooks = JSON.parse(hooksContent);
      assert.ok(hooks.PreToolUse.some((entry: any) => entry.command === 'rtk'));
    });
  });

  it('does not write hooks when rtk is disabled', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const adapter = new CodexCliAdapter({ enabled: true, baseDir: home, rtkEnabled: false });
      await adapter.initialize();

      assert.equal(fs.existsSync(path.join(home, '.codex', 'config.toml')), true);
      assert.equal(fs.existsSync(path.join(home, '.codex', 'hooks.json')), false);
    });
  });
});

describe('GitHub Copilot adapter', () => {
  it('writes a rtk pre-tool-use hook and enables hooks in config', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const adapter = new CopilotAdapter({ enabled: true, baseDir: home, rtkEnabled: true });
      const result = await adapter.initialize();

      const hookPath = path.join(home, '.copilot', 'hooks', 'pre-tool-use');
      assert.equal(result.success, true);
      assert.match(fs.readFileSync(hookPath, 'utf8'), /rtk hook copilot/);

      const configContent = fs.readFileSync(
        path.join(home, '.config', 'github-copilot', 'config.json'),
        'utf8',
      );
      assert.equal(JSON.parse(configContent).features.hooks, true);
    });
  });

  it('writes no hooks when rtk is disabled', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const adapter = new CopilotAdapter({ enabled: true, baseDir: home, rtkEnabled: false });
      await adapter.initialize();

      assert.equal(fs.existsSync(path.join(home, '.copilot', 'hooks', 'pre-tool-use')), false);
    });
  });
});

describe('OpenCode adapter', () => {
  it('creates opencode.json and the rtk plugin when rtk is enabled', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const adapter = new OpenCodeAdapter({ enabled: true, baseDir: home, rtkEnabled: true });
      const result = await adapter.initialize();

      const pluginPath = path.join(home, '.config', 'opencode', 'plugins', 'rtk-optimizer.js');
      assert.equal(result.success, true);
      assert.match(fs.readFileSync(pluginPath, 'utf8'), /rtk-optimizer/);

      const configContent = fs.readFileSync(
        path.join(home, '.config', 'opencode', 'opencode.json'),
        'utf8',
      );
      const config = JSON.parse(configContent);
      assert.ok(config.plugins.some((plugin: any) => plugin.name === 'rtk-optimizer'));
    });
  });

  it('creates only the base config when rtk is disabled', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const adapter = new OpenCodeAdapter({ enabled: true, baseDir: home, rtkEnabled: false });
      await adapter.initialize();

      assert.equal(fs.existsSync(path.join(home, '.config', 'opencode', 'opencode.json')), true);
      assert.equal(
        fs.existsSync(path.join(home, '.config', 'opencode', 'plugins', 'rtk-optimizer.js')),
        false,
      );
    });
  });
});
