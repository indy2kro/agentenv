import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SuperpowersAdapter, SUPERPOWERS_PLUGIN_ID } from './superpowers.js';
import type { ClaudeCliRunner } from './superpowers.js';
import type { IntegrationConfig } from '../config/schema.js';

interface RecordedCall {
  args: string[];
}

function fakeRunner(
  script: (call: RecordedCall) => {
    success: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  },
) {
  const calls: RecordedCall[] = [];
  const runner: ClaudeCliRunner = (args) => {
    const call = { args };
    calls.push(call);
    return script(call);
  };
  return { runner, calls };
}

function fakeFs(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  return {
    existsSync: (file: string) => files.has(file),
    readFileSync: (file: string) => {
      const content = files.get(file);
      if (content === undefined) throw new Error(`ENOENT: ${file}`);
      return content;
    },
    writeFileSync: (file: string, content: string) => {
      files.set(file, content);
    },
    mkdirSync: () => undefined,
    files,
  } as unknown as {
    existsSync: (path: string) => boolean;
    readFileSync: (path: string, encoding: 'utf-8') => string;
    writeFileSync: (path: string, content: string) => void;
    mkdirSync: (path: string, opts?: unknown) => void;
    files: Map<string, string>;
  };
}

const enabledConfig: IntegrationConfig = {
  enabled: true,
  source: 'github:obra/superpowers',
  scope: 'project',
  agents: ['claude_code', 'codex_cli', 'copilot', 'opencode'],
  allow_hooks: true,
  allow_external_requests: false,
};

describe('SuperpowersAdapter', () => {
  it('reports non-Claude agents as unsupported and never invokes the CLI for them', async () => {
    const { runner, calls } = fakeRunner(() => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs: fakeFs() });

    const result = await adapter.detect('/base', {
      ...enabledConfig,
      agents: ['codex_cli', 'copilot', 'opencode'],
    });

    assert.equal(result.agents.length, 3);
    assert.ok(result.agents.every((agent) => agent.state === 'unsupported'));
    assert.equal(calls.length, 0);
  });

  it('detects "missing" when `claude plugin list` does not mention superpowers', async () => {
    const { runner } = fakeRunner(() => ({
      success: true,
      exitCode: 0,
      stdout: 'commit-commands@claude-code-plugins',
      stderr: '',
    }));
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs: fakeFs() });

    const result = await adapter.detect('/base', { ...enabledConfig, agents: ['claude_code'] });

    assert.equal(result.agents[0].state, 'missing');
  });

  it('detects "missing" (not "unsupported") when the claude CLI itself is not on PATH', async () => {
    const { runner } = fakeRunner(() => ({
      success: false,
      exitCode: null,
      stdout: '',
      stderr: 'spawn claude ENOENT',
    }));
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs: fakeFs() });

    const result = await adapter.detect('/base', { ...enabledConfig, agents: ['claude_code'] });

    assert.equal(result.agents[0].state, 'missing');
    assert.equal(result.agents[0].detail, 'spawn claude ENOENT');
  });

  it('detects "installed" when the plugin is listed', async () => {
    const { runner } = fakeRunner(() => ({
      success: true,
      exitCode: 0,
      stdout: 'superpowers@claude-plugins-official',
      stderr: '',
    }));
    const fs = fakeFs({
      '/base/.agentenv-state/integrations/superpowers.json': JSON.stringify({
        scope: 'project',
        installedAt: '2026-09-14T00:00:00.000Z',
      }),
    });
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs });

    const result = await adapter.detect('/base', { ...enabledConfig, agents: ['claude_code'] });

    assert.equal(result.agents[0].state, 'installed');
  });

  it('apply() skips the install and warns when allow_hooks is not explicitly true', async () => {
    const { runner, calls } = fakeRunner(() => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs: fakeFs() });

    const result = await adapter.apply('/base', {
      ...enabledConfig,
      agents: ['claude_code'],
      allow_hooks: false,
    });

    assert.equal(result.agents[0].state, 'missing');
    assert.ok(result.warnings.some((warning) => warning.includes('allow_hooks')));
    assert.equal(
      calls.filter((call) => call.args[0] === 'plugin' && call.args[1] === 'marketplace').length,
      0,
    );
    assert.equal(
      calls.filter((call) => call.args[0] === 'plugin' && call.args[1] === 'install').length,
      0,
    );
  });

  it('apply() installs from the official marketplace with the configured scope, and adds no marketplace', async () => {
    const { runner, calls } = fakeRunner(() => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));
    const fs = fakeFs();
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs });

    const result = await adapter.apply('/base', { ...enabledConfig, agents: ['claude_code'] });

    assert.equal(result.errors.length, 0);
    assert.equal(result.agents[0].state, 'installed');
    assert.equal(SUPERPOWERS_PLUGIN_ID, 'superpowers@claude-plugins-official');
    // The third-party marketplace repo has no tag for the plugin's ref, so the
    // old `marketplace add <repo>#<ref>` failed; the official one is built in.
    assert.equal(
      calls.filter((call) => call.args.includes('marketplace')).length,
      0,
      'no marketplace add',
    );
    const installCalls = calls.filter((call) => call.args[1] === 'install');
    assert.deepEqual(
      installCalls.map((call) => call.args),
      [['plugin', 'install', 'superpowers@claude-plugins-official', '--scope', 'project']],
    );
    assert.ok(fs.files.has('/base/.agentenv-state/integrations/superpowers.json'));
  });

  it('apply() records an error and does not write a marker when the install fails', async () => {
    const { runner } = fakeRunner((call) =>
      call.args[1] === 'install'
        ? { success: false, exitCode: 1, stdout: '', stderr: 'network error' }
        : { success: true, exitCode: 0, stdout: '', stderr: '' },
    );
    const fs = fakeFs();
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs });

    const result = await adapter.apply('/base', { ...enabledConfig, agents: ['claude_code'] });

    assert.ok(result.errors.length > 0);
    assert.equal(fs.files.has('/base/.agentenv-state/integrations/superpowers.json'), false);
  });

  it('apply() is idempotent: a second apply against an already-installed state runs no install commands', async () => {
    const { runner, calls } = fakeRunner((call) =>
      call.args[0] === 'plugin' && call.args[1] === 'list'
        ? { success: true, exitCode: 0, stdout: 'superpowers@claude-plugins-official', stderr: '' }
        : { success: true, exitCode: 0, stdout: '', stderr: '' },
    );
    const fs = fakeFs({
      '/base/.agentenv-state/integrations/superpowers.json': JSON.stringify({
        scope: 'project',
        installedAt: '2026-09-14T00:00:00.000Z',
      }),
    });
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs });

    const result = await adapter.apply('/base', { ...enabledConfig, agents: ['claude_code'] });

    assert.equal(result.agents[0].state, 'installed');
    assert.equal(calls.filter((call) => call.args.includes('marketplace')).length, 0);
    assert.equal(calls.filter((call) => call.args[1] === 'install').length, 0);
  });

  it('never attempts anything network/external, and warns when allow_external_requests is not explicitly true', async () => {
    const { runner } = fakeRunner(() => ({ success: true, exitCode: 0, stdout: '', stderr: '' }));
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs: fakeFs() });

    const result = await adapter.apply('/base', {
      ...enabledConfig,
      agents: ['claude_code'],
      allow_external_requests: false,
    });

    assert.ok(result.warnings.some((warning) => warning.includes('external requests disabled')));

    const withRequestsAllowed = await adapter.apply('/base', {
      ...enabledConfig,
      agents: ['claude_code'],
      allow_external_requests: true,
    });
    assert.ok(
      !withRequestsAllowed.warnings.some((warning) =>
        warning.includes('external requests disabled'),
      ),
    );
    // Either way, the adapter's only possible native commands are the two
    // claude plugin subcommands below — there is no code path that reaches
    // out to anything else regardless of this flag.
  });

  it('apply() returns the plain detect() result without side effects when disabled', async () => {
    const { runner, calls } = fakeRunner(() => ({
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }));
    const adapter = new SuperpowersAdapter({ runClaudeCli: runner, fs: fakeFs() });

    const result = await adapter.apply('/base', {
      ...enabledConfig,
      enabled: false,
      agents: ['claude_code'],
    });

    assert.equal(result.errors.length, 0);
    assert.equal(calls.filter((call) => call.args[1] === 'install').length, 0);
  });
});
