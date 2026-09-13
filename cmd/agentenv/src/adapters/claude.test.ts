import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeCodeAdapter } from './claude.js';

describe('Claude Code adapter', () => {
  it('adds its hook to Claude Code’s hook-object format without removing existing hooks', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-claude-'));
    const priorHome = process.env.HOME;
    process.env.HOME = home;
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'existing hook' }] }],
        },
      }),
    );

    try {
      const adapter = new ClaudeCodeAdapter({ enabled: true, baseDir: home, rtkEnabled: true });
      const result = await adapter.initialize();
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

      assert.equal(result.success, true);
      assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'existing hook');
      assert.equal(settings.hooks.PreToolUse[1].hooks[0].command, 'rtk hook claude');
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
    }
  });
});
