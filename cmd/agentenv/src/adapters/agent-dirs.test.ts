import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'os';
import * as path from 'path';
import {
  claudeConfigDir,
  codexConfigDir,
  copilotConfigDir,
  homeDir,
  opencodeConfigDir,
  xdgConfigDir,
} from './agent-dirs.js';

function withEnv(vars: Record<string, string | undefined>, run: () => void): void {
  const prior: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prior[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('homeDir', () => {
  it('prefers HOME, then USERPROFILE, then os.homedir() — never an empty string', () => {
    withEnv({ HOME: '/custom/home', USERPROFILE: undefined }, () => {
      assert.equal(homeDir(), '/custom/home');
    });
    withEnv({ HOME: undefined, USERPROFILE: 'C:\\Users\\custom' }, () => {
      assert.equal(homeDir(), 'C:\\Users\\custom');
    });
    withEnv({ HOME: undefined, USERPROFILE: undefined }, () => {
      assert.equal(homeDir(), os.homedir());
      assert.notEqual(homeDir(), '');
    });
  });
});

describe('xdgConfigDir', () => {
  it('uses XDG_CONFIG_HOME when absolute', () => {
    withEnv({ XDG_CONFIG_HOME: '/custom/xdg' }, () => {
      assert.equal(xdgConfigDir(), '/custom/xdg');
    });
  });

  it('falls back to <home>/.config when XDG_CONFIG_HOME is unset or relative', () => {
    withEnv({ XDG_CONFIG_HOME: undefined, HOME: '/h' }, () => {
      assert.equal(xdgConfigDir(), path.join('/h', '.config'));
    });
    withEnv({ XDG_CONFIG_HOME: 'relative', HOME: '/h' }, () => {
      assert.equal(xdgConfigDir(), path.join('/h', '.config'));
    });
  });
});

describe('per-agent config dirs', () => {
  it('claudeConfigDir honors an absolute CLAUDE_CONFIG_DIR, ignores a relative one', () => {
    withEnv({ CLAUDE_CONFIG_DIR: '/relocated/claude', HOME: '/h' }, () => {
      assert.equal(claudeConfigDir(), '/relocated/claude');
    });
    withEnv({ CLAUDE_CONFIG_DIR: 'relative', HOME: '/h' }, () => {
      assert.equal(claudeConfigDir(), path.join('/h', '.claude'));
    });
    withEnv({ CLAUDE_CONFIG_DIR: undefined, HOME: '/h' }, () => {
      assert.equal(claudeConfigDir(), path.join('/h', '.claude'));
    });
  });

  it('codexConfigDir honors an absolute CODEX_HOME, ignores a relative one', () => {
    withEnv({ CODEX_HOME: '/relocated/codex', HOME: '/h' }, () => {
      assert.equal(codexConfigDir(), '/relocated/codex');
    });
    withEnv({ CODEX_HOME: 'relative', HOME: '/h' }, () => {
      assert.equal(codexConfigDir(), path.join('/h', '.codex'));
    });
  });

  it('copilotConfigDir and opencodeConfigDir both follow XDG_CONFIG_HOME', () => {
    withEnv({ XDG_CONFIG_HOME: '/custom/xdg' }, () => {
      assert.equal(copilotConfigDir(), path.join('/custom/xdg', 'github-copilot'));
      assert.equal(opencodeConfigDir(), path.join('/custom/xdg', 'opencode'));
    });
  });
});
