import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { interactiveScopeIgnoredWarning, misePrereqCheck, unattendedSetup } from './setup.js';
import { applyConfiguration } from './apply.js';
import { DEFAULT_CONFIG, saveConfig } from '../config/schema.js';

function tempDir(prefix: string): string {
  // realpathSync: several tests here process.chdir() into this directory and
  // then compare a baseDir/path the code derived from process.cwd() against
  // the raw value returned here. On macOS, os.tmpdir() is under
  // /var/folders/..., a symlink to /private/var/folders/...; POSIX
  // chdir+getcwd resolves through that symlink, so the two would otherwise
  // never match.
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

// The step 0 prerequisite must be printed exactly once across the
// setup -> apply pipeline: setup prints it and tells apply not to repeat it.
// (Plan Task 2: prereq check deduplication.)

describe('setup prerequisite check', () => {
  it('prints the one "Prerequisite: mise" line when mise is installed', () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (message?: unknown) => logs.push(String(message));
    try {
      const ok = misePrereqCheck({ isInstalled: () => true, version: () => '3.2.1' });
      assert.equal(ok, true);
      const prereq = logs.filter((line) => line.startsWith('Prerequisite: mise'));
      assert.equal(prereq.length, 1);
      assert.match(prereq[0], /Prerequisite: mise 3\.2\.1/);
    } finally {
      console.log = original;
    }
  });

  it('fails loudly with install instructions when mise is missing', () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (message?: unknown) => errors.push(String(message));
    try {
      const ok = misePrereqCheck({ isInstalled: () => false });
      assert.equal(ok, false);
      assert.ok(errors.some((line) => /install mise/i.test(line)));
    } finally {
      console.error = original;
    }
  });
});

describe('unattended setup pipeline', () => {
  it('emits exactly one prerequisite line and suppresses the apply duplicate', async () => {
    const dir = tempDir('agentenv-setup-');
    const toml = path.join(dir, 'agentenv.toml');
    saveConfig(DEFAULT_CONFIG, toml);

    let seenOptions: { skipPrereqMessage?: boolean } | undefined;
    const stubApply: typeof applyConfiguration = async (_config, _baseDir, options = {}) => {
      seenOptions = options;
      return { success: true, messages: [], errors: [] };
    };

    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalCwd = process.cwd();
    console.log = (message?: unknown) => logs.push(String(message));
    console.error = () => {};
    try {
      process.chdir(dir);
      await unattendedSetup(
        { config: toml, yes: true },
        {
          misePrereqCheckDeps: { isInstalled: () => true, version: () => '3.2.1' },
          applyConfiguration: stubApply,
        },
      );
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
      console.error = originalError;
    }

    assert.equal(seenOptions?.skipPrereqMessage, true);
    assert.equal(logs.filter((line) => line.startsWith('Prerequisite: mise')).length, 1);
  });

  it('enables the Superpowers integration when --superpowers is passed', async () => {
    const dir = tempDir('agentenv-setup-');
    const xdgDir = tempDir('agentenv-xdg-');
    let saved: import('../config/schema.js').AgentenvConfig | undefined;
    const stubApply: typeof applyConfiguration = async (config) => {
      saved = config;
      return { success: true, messages: [], errors: [] };
    };

    const originalLog = console.log;
    const originalError = console.error;
    const originalCwd = process.cwd();
    const originalXdg = process.env.XDG_CONFIG_HOME;
    console.log = () => {};
    console.error = () => {};
    try {
      fs.mkdirSync(path.join(xdgDir, 'agentenv'), { recursive: true });
      process.env.XDG_CONFIG_HOME = xdgDir;
      process.chdir(dir);
      await unattendedSetup(
        { yes: true, agents: 'claude_code', superpowers: 'v7.0.0', tier2: false, rtk: false },
        {
          misePrereqCheckDeps: { isInstalled: () => true, version: () => '3.2.1' },
          applyConfiguration: stubApply,
        },
      );
    } finally {
      process.chdir(originalCwd);
      if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = originalXdg;
      console.log = originalLog;
      console.error = originalError;
    }

    assert.equal(saved?.integrations?.superpowers?.enabled, true);
    assert.equal(saved?.integrations?.superpowers?.ref, 'v7.0.0');
    assert.deepEqual(saved?.integrations?.superpowers?.agents, ['claude_code']);
    const toml = fs.readFileSync(path.join(dir, 'agentenv.toml'), 'utf-8');
    assert.match(toml, /\[integrations\.superpowers\]/);
  });

  it('re-applies the nearest user config instead of writing a fresh project config (UX-04)', async () => {
    const projectDir = tempDir('agentenv-project-');
    const xdgDir = tempDir('agentenv-xdg-');
    const userToml = path.join(xdgDir, 'agentenv', 'agentenv.toml');
    fs.mkdirSync(path.dirname(userToml), { recursive: true });
    saveConfig({ ...DEFAULT_CONFIG, scope: 'user', agents: { claude_code: true } }, userToml);

    let appliedConfig: import('../config/schema.js').AgentenvConfig | undefined;
    let appliedBaseDir: string | undefined;
    const stubApply: typeof applyConfiguration = async (config, baseDir) => {
      appliedConfig = config;
      appliedBaseDir = baseDir;
      return { success: true, messages: [], errors: [] };
    };

    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalCwd = process.cwd();
    const originalXdg = process.env.XDG_CONFIG_HOME;
    console.log = (message?: unknown) => logs.push(String(message));
    console.error = () => {};
    try {
      process.env.XDG_CONFIG_HOME = xdgDir;
      process.chdir(projectDir);
      await unattendedSetup(
        { yes: true, agents: 'claude_code' },
        {
          misePrereqCheckDeps: { isInstalled: () => true, version: () => '3.2.1' },
          applyConfiguration: stubApply,
        },
      );
    } finally {
      process.chdir(originalCwd);
      if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = originalXdg;
      console.log = originalLog;
      console.error = originalError;
    }

    assert.equal(appliedConfig?.scope, 'user');
    assert.equal(appliedBaseDir, path.join(xdgDir, 'agentenv'));
    assert.equal(fs.existsSync(path.join(projectDir, 'agentenv.toml')), false);
    assert.ok(
      logs.some((line) => line.includes(userToml)),
      'should print the nearest config path',
    );
  });

  it('applies a project config found in a parent directory to that directory, not cwd (FEAT-05)', async () => {
    const projectRoot = tempDir('agentenv-project-');
    const nestedCwd = path.join(projectRoot, 'src', 'commands');
    fs.mkdirSync(nestedCwd, { recursive: true });
    const projectToml = path.join(projectRoot, 'agentenv.toml');
    saveConfig({ ...DEFAULT_CONFIG, agents: { claude_code: true } }, projectToml);

    let appliedBaseDir: string | undefined;
    const stubApply: typeof applyConfiguration = async (_config, baseDir) => {
      appliedBaseDir = baseDir;
      return { success: true, messages: [], errors: [] };
    };

    const originalLog = console.log;
    const originalError = console.error;
    const originalCwd = process.cwd();
    console.log = () => {};
    console.error = () => {};
    try {
      process.chdir(nestedCwd);
      await unattendedSetup(
        { yes: true },
        {
          misePrereqCheckDeps: { isInstalled: () => true, version: () => '3.2.1' },
          applyConfiguration: stubApply,
        },
      );
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
      console.error = originalError;
    }

    assert.equal(appliedBaseDir, projectRoot);
  });

  it('warns that --agents/--superpowers are ignored when reusing an existing config', async () => {
    const dir = tempDir('agentenv-setup-');
    const toml = path.join(dir, 'agentenv.toml');
    saveConfig({ ...DEFAULT_CONFIG, agents: { claude_code: true } }, toml);

    const stubApply: typeof applyConfiguration = async () => ({
      success: true,
      messages: [],
      errors: [],
    });

    const warnings: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalCwd = process.cwd();
    console.log = () => {};
    console.error = () => {};
    console.warn = (message?: unknown) => warnings.push(String(message));
    try {
      process.chdir(dir);
      await unattendedSetup(
        { yes: true, agents: 'codex_cli', superpowers: 'v7.0.0' },
        {
          misePrereqCheckDeps: { isInstalled: () => true, version: () => '3.2.1' },
          applyConfiguration: stubApply,
        },
      );
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }

    assert.ok(warnings.some((line) => line.includes('--agents')));
    assert.ok(warnings.some((line) => line.includes('--superpowers')));
  });

  it('does not warn when no unattended flags are passed alongside an existing config', async () => {
    const dir = tempDir('agentenv-setup-');
    const toml = path.join(dir, 'agentenv.toml');
    saveConfig({ ...DEFAULT_CONFIG, agents: { claude_code: true } }, toml);

    const stubApply: typeof applyConfiguration = async () => ({
      success: true,
      messages: [],
      errors: [],
    });

    const warnings: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalCwd = process.cwd();
    console.log = () => {};
    console.error = () => {};
    console.warn = (message?: unknown) => warnings.push(String(message));
    try {
      process.chdir(dir);
      await unattendedSetup(
        { yes: true },
        {
          misePrereqCheckDeps: { isInstalled: () => true, version: () => '3.2.1' },
          applyConfiguration: stubApply,
        },
      );
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }

    assert.deepEqual(warnings, []);
  });

  it('reports a parse error instead of throwing when the existing config is malformed', async () => {
    const dir = tempDir('agentenv-setup-');
    const toml = path.join(dir, 'agentenv.toml');
    fs.writeFileSync(toml, '[agents\nclaude_code = true');

    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalCwd = process.cwd();
    console.log = () => {};
    console.error = (message?: unknown) => errors.push(String(message));
    try {
      process.chdir(dir);
      await unattendedSetup(
        { yes: true },
        { misePrereqCheckDeps: { isInstalled: () => true, version: () => '3.2.1' } },
      );
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
      console.error = originalError;
    }

    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
    assert.ok(errors.some((line) => /Invalid agentenv configuration/.test(line)));
  });
});

describe('interactiveScopeIgnoredWarning', () => {
  it('warns when --scope was passed', () => {
    const warning = interactiveScopeIgnoredWarning('user');
    assert.match(warning ?? '', /--scope is ignored by the interactive wizard/);
    assert.match(warning ?? '', /--scope user/);
  });

  it('is silent when --scope was not passed', () => {
    assert.equal(interactiveScopeIgnoredWarning(undefined), undefined);
  });
});
