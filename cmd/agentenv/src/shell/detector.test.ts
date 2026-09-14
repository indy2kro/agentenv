import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyAgentShellFix, bashExecutable } from './detector.js';

const bashExe = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe';

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-tier0s-'));
}

describe('Tier 0 shell fix', () => {
  it('resolves bash.exe from both Git Bash directory forms', () => {
    assert.equal(bashExecutable('C:\\Program Files\\Git\\usr\\bin'), bashExe);
    assert.equal(bashExecutable('C:\\Program Files\\Git\\bin'), bashExe);
  });

  describe('Claude Code', () => {
    it('creates settings.json with the Git Bash env override', () => {
      const home = tempHome();
      const result = applyAgentShellFix('claude_code', bashExe, home);
      const settings = JSON.parse(
        fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'),
      );

      assert.equal(result.action, 'created');
      assert.equal(settings.env.CLAUDE_CODE_GIT_BASH_PATH, bashExe);
    });

    it('preserves existing user settings and is idempotent', () => {
      const home = tempHome();
      const file = path.join(home, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({
          env: { SOME_USER_VAR: 'x' },
          permissions: { allow: ['Bash(claude:*)'] },
        }),
      );

      applyAgentShellFix('claude_code', bashExe, home);
      const once: Record<string, any> = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(once.env.CLAUDE_CODE_GIT_BASH_PATH, bashExe);
      assert.equal(once.env.SOME_USER_VAR, 'x');
      assert.deepEqual(once.permissions, { allow: ['Bash(claude:*)'] });

      const second = applyAgentShellFix('claude_code', bashExe, home);
      assert.equal(second.action, 'unchanged');
    });

    it('skips unparseable user settings instead of clobbering them', () => {
      const home = tempHome();
      const file = path.join(home, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '{"broken":');

      const result = applyAgentShellFix('claude_code', bashExe, home);
      assert.equal(result.action, 'skipped');
      assert.equal(fs.readFileSync(file, 'utf8'), '{"broken":');
    });
  });

  describe('Codex CLI', () => {
    it('creates config.toml with the [windows] shell_path', () => {
      const home = tempHome();
      const result = applyAgentShellFix('codex_cli', bashExe, home);
      const content = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');

      assert.equal(result.action, 'created');
      assert.match(content, /\[windows\]/);
      assert.match(content, /shell_path = "C:\\\\Program Files\\\\Git\\\\usr\\\\bin\\\\bash\.exe"/);
    });

    it('preserves existing config sections and is idempotent', () => {
      const home = tempHome();
      const file = path.join(home, '.codex', 'config.toml');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '[model]\nwire_api = true\n\n[features]\nhooks = true\n');

      applyAgentShellFix('codex_cli', bashExe, home);
      const content = fs.readFileSync(file, 'utf8');
      assert.match(content, /\[model\]/);
      assert.match(content, /wire_api = true/);
      assert.match(content, /\[features\]/);
      assert.match(content, /\[windows\]/);

      const second = applyAgentShellFix('codex_cli', bashExe, home);
      assert.equal(second.action, 'unchanged');
    });
  });

  describe('OpenCode', () => {
    it('creates opencode.json with shell and defaultShell', () => {
      const home = tempHome();
      const result = applyAgentShellFix('opencode', bashExe, home);
      const config = JSON.parse(
        fs.readFileSync(path.join(home, '.config', 'opencode', 'opencode.json'), 'utf8'),
      );

      assert.equal(result.action, 'created');
      assert.equal(config.shell, bashExe);
      assert.equal(config.defaultShell, bashExe);
    });

    it('preserves existing config keys and is idempotent', () => {
      const home = tempHome();
      const file = path.join(home, '.config', 'opencode', 'opencode.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ theme: 'dark', plugins: [] }));

      applyAgentShellFix('opencode', bashExe, home);
      const config: Record<string, any> = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(config.shell, bashExe);
      assert.equal(config.theme, 'dark');

      const second = applyAgentShellFix('opencode', bashExe, home);
      assert.equal(second.action, 'unchanged');
    });
  });

  describe('GitHub Copilot', () => {
    it('is skipped (no per-file override mechanism)', () => {
      const home = tempHome();
      const result = applyAgentShellFix('copilot', bashExe, home);
      assert.equal(result.action, 'skipped');
      assert.equal(result.file, '');
    });
  });
});
