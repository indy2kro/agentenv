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

  it('cleanup removes the RTK hook and a second cleanup is a truthful no-op', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-claude-'));
    const priorHome = process.env.HOME;
    process.env.HOME = home;
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const adapter = new ClaudeCodeAdapter({ enabled: true, baseDir: home, rtkEnabled: true });

    try {
      await adapter.initialize();
      const first = await adapter.cleanup();
      assert.equal(first.success, true);
      assert.deepEqual(first.filesModified, [settingsPath]);
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      assert.equal(settings.hooks.PreToolUse.length, 0);

      const second = await adapter.cleanup();
      assert.equal(second.success, true);
      assert.deepEqual(second.filesModified, []);
      assert.equal(fs.readFileSync(settingsPath, 'utf8'), JSON.stringify(settings, null, 2));
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
    }
  });

  it('cleanup reports a corrupt settings.json as an error instead of fake success', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-claude-'));
    const priorHome = process.env.HOME;
    process.env.HOME = home;
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, '{not json');

    try {
      const adapter = new ClaudeCodeAdapter({ enabled: true, baseDir: home, rtkEnabled: true });
      const result = await adapter.cleanup();
      assert.equal(result.success, false);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0], /not valid JSON/);
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
    }
  });

  it('initialize reports a corrupt settings.json as an error and leaves it untouched', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-claude-'));
    const priorHome = process.env.HOME;
    process.env.HOME = home;
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const original = '{not json, but has "real": "permissions"';
    fs.writeFileSync(settingsPath, original);

    try {
      const adapter = new ClaudeCodeAdapter({ enabled: true, baseDir: home, rtkEnabled: true });
      const result = await adapter.initialize();

      assert.equal(result.success, false);
      assert.ok(result.errors.some((error) => /not valid JSON/.test(error)));
      assert.equal(fs.readFileSync(settingsPath, 'utf8'), original);
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
    }
  });

  it('initialize does not rewrite settings.json when the RTK hook already exists', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-claude-'));
    const priorHome = process.env.HOME;
    process.env.HOME = home;
    const settingsPath = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });

    try {
      const adapter = new ClaudeCodeAdapter({ enabled: true, baseDir: home, rtkEnabled: true });
      await adapter.initialize();
      const contentAfterFirst = fs.readFileSync(settingsPath, 'utf8');

      // A second initialize with the hook already present must be a true no-op.
      const result = await adapter.initialize();

      assert.equal(result.success, true);
      assert.deepEqual(result.filesModified, []);
      assert.equal(fs.readFileSync(settingsPath, 'utf8'), contentAfterFirst);
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
    }
  });
});
