import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { checkbox, confirm, input, select } from '@inquirer/prompts';
import { runConfigWizard } from './wizard.js';
import type { WizardDeps } from './wizard.js';
import { DEFAULT_CONFIG } from '../config/schema.js';
import type { AgentenvConfig } from '../config/schema.js';

/**
 * A fake prompt harness keyed by each prompt's exact `message` text — every
 * scenario below answers exactly the messages that scenario's path through
 * the wizard actually asks; an unanswered message throws immediately,
 * turning "the wizard asked something this test didn't expect" into a loud
 * failure instead of a hang.
 */
function fakePrompts(answers: Record<string, unknown>): {
  deps: Pick<WizardDeps, 'checkbox' | 'confirm' | 'input' | 'select'>;
  calls: string[];
} {
  const calls: string[] = [];
  const lookup = (message: string): unknown => {
    calls.push(message);
    if (!(message in answers)) {
      throw new Error(`fakePrompts: no canned answer for "${message}"`);
    }
    return answers[message];
  };
  const asyncLookup = async (opts: { message: string }): Promise<unknown> => lookup(opts.message);
  return {
    deps: {
      checkbox: asyncLookup as unknown as typeof checkbox,
      confirm: asyncLookup as unknown as typeof confirm,
      input: asyncLookup as unknown as typeof input,
      select: asyncLookup as unknown as typeof select,
    },
    calls,
  };
}

const HAPPY_PATH_ANSWERS = {
  'Select agents:': ['claude_code'],
  'Select tools (Tiers 1-3):': ['ripgrep'],
  'Add a custom binary?': false,
  'Scope:': 'project',
  'Enable rtk command rewriting?': true,
  'Enable the optional Superpowers integration for Claude Code? (installs a third-party plugin via `claude plugin install`)': false,
  'Apply this configuration?': true,
};

function baseDeps(overrides: Partial<WizardDeps> = {}): WizardDeps {
  return {
    isTTY: () => true,
    isMiseInstalled: () => true,
    getMiseVersion: () => '3.2.1',
    loadConfig: () => ({ ...DEFAULT_CONFIG }),
    findConfigPath: () => undefined,
    detectInstalledAgents: () => [],
    saveAndApply: async () => {},
    ...overrides,
  };
}

async function withCapturedOutput<T>(
  fn: () => Promise<T> | T,
): Promise<{ result: T; logs: string[]; errors: string[] }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (message?: unknown) => logs.push(String(message));
  console.error = (message?: unknown) => errors.push(String(message));
  try {
    const result = await fn();
    return { result, logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe('runConfigWizard — preflight gates', () => {
  it('exits 1 without prompting when stdin/stdout is not a TTY', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    const { calls, deps } = fakePrompts({});
    const { errors } = await withCapturedOutput(() =>
      runConfigWizard(baseDeps({ ...deps, isTTY: () => false })),
    );
    assert.equal(process.exitCode, 1);
    assert.ok(errors.some((line) => /Setup is interactive/.test(line)));
    assert.deepEqual(calls, []);
    process.exitCode = saved;
  });

  it('exits 1 without prompting when mise is not installed', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    const { calls, deps } = fakePrompts({});
    const { errors } = await withCapturedOutput(() =>
      runConfigWizard(baseDeps({ ...deps, isMiseInstalled: () => false })),
    );
    assert.equal(process.exitCode, 1);
    assert.ok(errors.some((line) => /agentenv requires mise/.test(line)));
    assert.deepEqual(calls, []);
    process.exitCode = saved;
  });

  it('exits 1 and reports the error when the existing config fails to parse', async () => {
    const saved = process.exitCode;
    process.exitCode = undefined;
    const { calls, deps } = fakePrompts({});
    const { errors } = await withCapturedOutput(() =>
      runConfigWizard(
        baseDeps({
          ...deps,
          loadConfig: () => {
            throw new Error('bad toml at line 3');
          },
        }),
      ),
    );
    assert.equal(process.exitCode, 1);
    assert.ok(errors.some((line) => line.includes('bad toml at line 3')));
    assert.deepEqual(calls, []);
    process.exitCode = saved;
  });
});

describe('runConfigWizard — happy path', () => {
  it('walks all 7 steps and calls saveAndApply with the assembled config', async () => {
    const { deps, calls } = fakePrompts(HAPPY_PATH_ANSWERS);
    let savedConfig: AgentenvConfig | undefined;
    let savedFile: string | undefined;
    await withCapturedOutput(() =>
      runConfigWizard(
        baseDeps({
          ...deps,
          saveAndApply: async (config, file) => {
            savedConfig = config;
            savedFile = file;
          },
        }),
      ),
    );

    assert.deepEqual(calls, Object.keys(HAPPY_PATH_ANSWERS));
    assert.ok(savedConfig);
    assert.equal(savedConfig?.agents?.claude_code, true);
    assert.equal(savedConfig?.tools?.ripgrep, true);
    assert.equal(savedConfig?.rtk?.enabled, true);
    assert.equal(savedConfig?.scope, 'project');
    // Declined this run and wasn't previously enabled, so it passes through
    // existing.integrations (DEFAULT_CONFIG's) untouched — still disabled.
    assert.equal(savedConfig?.integrations?.superpowers?.enabled, false);
    assert.match(savedFile ?? '', /agentenv\.toml$/);
  });

  it('does not call saveAndApply when the user declines the final confirmation', async () => {
    const { deps } = fakePrompts({ ...HAPPY_PATH_ANSWERS, 'Apply this configuration?': false });
    let saveAndApplyCalled = false;
    const { logs } = await withCapturedOutput(() =>
      runConfigWizard(
        baseDeps({
          ...deps,
          saveAndApply: async () => {
            saveAndApplyCalled = true;
          },
        }),
      ),
    );

    assert.equal(saveAndApplyCalled, false);
    assert.ok(logs.some((line) => line.includes('Cancelled')));
  });
});

describe('runConfigWizard — custom binaries', () => {
  it('adds an already-installed custom tool with blank paths (nothing "missing")', async () => {
    const { deps } = fakePrompts({
      ...HAPPY_PATH_ANSWERS,
      'Add a custom binary?': true,
      'Tool name (e.g. "my-tool"):': 'my-tool',
      'Description (optional):': 'a tool',
      'Already installed?': true,
      'Windows path (e.g. C:\\tools\\my-tool.exe):': '',
      'macOS path (e.g. /usr/local/bin/my-tool):': '',
      'Linux path (e.g. /usr/bin/my-tool):': '',
      'Add another custom binary?': false,
    });
    let savedConfig: AgentenvConfig | undefined;
    await withCapturedOutput(() =>
      runConfigWizard(
        baseDeps({ ...deps, saveAndApply: async (config) => void (savedConfig = config) }),
      ),
    );

    assert.deepEqual(savedConfig?.custom_tools, [
      {
        name: 'my-tool',
        description: 'a tool',
        already_installed: true,
        path_windows: '',
        path_macos: '',
        path_linux: '',
      },
    ]);
  });

  it('adds a not-yet-installed custom tool with a mise source', async () => {
    const { deps } = fakePrompts({
      ...HAPPY_PATH_ANSWERS,
      'Add a custom binary?': true,
      'Tool name (e.g. "my-tool"):': 'pymgr',
      'Description (optional):': '',
      'Already installed?': false,
      'mise source (e.g. github:owner/repo):': 'github:owner/pymgr',
      'Version (default: latest):': 'latest',
      'Add another custom binary?': false,
    });
    let savedConfig: AgentenvConfig | undefined;
    await withCapturedOutput(() =>
      runConfigWizard(
        baseDeps({ ...deps, saveAndApply: async (config) => void (savedConfig = config) }),
      ),
    );

    assert.deepEqual(savedConfig?.custom_tools, [
      {
        name: 'pymgr',
        description: '',
        already_installed: false,
        mise_source: 'github:owner/pymgr',
        version: 'latest',
      },
    ]);
  });
});

describe('runConfigWizard — Superpowers integration', () => {
  it('assembles the Superpowers config when enabled and confirmed', async () => {
    const { deps } = fakePrompts({
      ...HAPPY_PATH_ANSWERS,
      'Enable the optional Superpowers integration for Claude Code? (installs a third-party plugin via `claude plugin install`)': true,
      'Superpowers ref to pin (tag/branch/commit):': 'v1.2.3',
      'Allow Superpowers to register its SessionStart hook for Claude Code?': true,
      'Allow the optional Superpowers visual companion to make external requests?': false,
      'Confirm enabling Superpowers with these settings?': true,
    });
    let savedConfig: AgentenvConfig | undefined;
    await withCapturedOutput(() =>
      runConfigWizard(
        baseDeps({ ...deps, saveAndApply: async (config) => void (savedConfig = config) }),
      ),
    );

    assert.deepEqual(savedConfig?.integrations?.superpowers, {
      enabled: true,
      source: 'github:obra/superpowers',
      ref: 'v1.2.3',
      scope: 'project',
      agents: ['claude_code'],
      allow_hooks: true,
      allow_external_requests: false,
    });
  });

  it('falls back to the existing integrations when the final Superpowers confirmation is declined', async () => {
    const existing: AgentenvConfig = {
      ...DEFAULT_CONFIG,
      integrations: { superpowers: { enabled: false, source: 'x', ref: 'v1', scope: 'project' } },
    };
    const { deps } = fakePrompts({
      ...HAPPY_PATH_ANSWERS,
      'Enable the optional Superpowers integration for Claude Code? (installs a third-party plugin via `claude plugin install`)': true,
      'Superpowers ref to pin (tag/branch/commit):': 'v1.2.3',
      'Allow Superpowers to register its SessionStart hook for Claude Code?': false,
      'Allow the optional Superpowers visual companion to make external requests?': false,
      'Confirm enabling Superpowers with these settings?': false,
    });
    let savedConfig: AgentenvConfig | undefined;
    await withCapturedOutput(() =>
      runConfigWizard(
        baseDeps({
          ...deps,
          loadConfig: () => existing,
          saveAndApply: async (config) => void (savedConfig = config),
        }),
      ),
    );

    assert.deepEqual(savedConfig?.integrations, existing.integrations);
  });

  it('disables a currently-enabled Superpowers integration when declined this run', async () => {
    const existing: AgentenvConfig = {
      ...DEFAULT_CONFIG,
      integrations: {
        superpowers: {
          enabled: true,
          source: 'github:obra/superpowers',
          ref: 'v1.0.0',
          scope: 'project',
          agents: ['claude_code'],
        },
      },
    };
    const { deps } = fakePrompts(HAPPY_PATH_ANSWERS); // Superpowers prompt answered false.
    let savedConfig: AgentenvConfig | undefined;
    await withCapturedOutput(() =>
      runConfigWizard(
        baseDeps({
          ...deps,
          loadConfig: () => existing,
          saveAndApply: async (config) => void (savedConfig = config),
        }),
      ),
    );

    assert.equal(savedConfig?.integrations?.superpowers?.enabled, false);
  });
});
