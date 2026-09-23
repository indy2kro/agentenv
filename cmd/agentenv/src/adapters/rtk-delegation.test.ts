import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import { RTK_AGENT_MIN_VERSIONS } from '../toolchain/rtk.js';
import type { RtkInitFn, RtkInstallationCheck } from '../toolchain/rtk.js';
import type { AdapterConfig } from './base.js';

interface RtkCall {
  args: string[];
  cwd: string;
}

function fakeRtkInit(): { fn: RtkInitFn; calls: RtkCall[] } {
  const calls: RtkCall[] = [];
  const fn: RtkInitFn = (args, cwd) => {
    calls.push({ args, cwd });
    fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK\n');
    return { success: true, message: 'rtk init succeeded', stdout: '', stderr: '' };
  };
  return { fn, calls };
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeConfig(home: string, rtkInit: RtkInitFn): AdapterConfig {
  return { enabled: true, baseDir: home, rtkEnabled: true, rtkInit };
}

describe('RtkDelegationAdapter', () => {
  it('creates configDir and delegates to rtk init with provided flags', async () => {
    const home = tempDir('agentenv-rtk-deleg-');
    const configDir = path.join(home, '.gemini');
    const rtk = fakeRtkInit();
    const adapter = new RtkDelegationAdapter(makeConfig(home, rtk.fn), {
      agentKey: 'gemini_cli',
      label: 'Gemini CLI',
      rtkFlags: ['--gemini'],
      configDir,
      expectedFile: 'RTK.md',
    });

    const result = await adapter.initialize();

    assert.equal(result.success, true);
    assert.equal(result.errors.length, 0);
    assert.ok(fs.existsSync(configDir), 'configDir should be created');
    assert.ok(fs.existsSync(path.join(home, 'RTK.md')), 'RTK.md should be created by fake rtk');
    assert.deepEqual(rtk.calls, [{ args: ['--gemini'], cwd: home }]);
    assert.equal(adapter.getName(), 'Gemini CLI');
    assert.equal(adapter.getConfigDir(), configDir);
  });

  it('propagates rtk failure', async () => {
    const home = tempDir('agentenv-rtk-deleg-fail-');
    const failRtk: RtkInitFn = () => ({
      success: false,
      message: 'fail',
      stdout: '',
      stderr: 'details',
    });
    const failAdapter = new RtkDelegationAdapter(makeConfig(home, failRtk), {
      agentKey: 'vibe',
      label: 'Mistral Vibe',
      rtkFlags: ['--agent', 'vibe'],
      configDir: path.join(home, '.vibe'),
      expectedFile: 'RTK.md',
    });

    const result = await failAdapter.initialize();

    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => e.includes('fail')));
  });

  it('skips when disabled', async () => {
    const home = tempDir('agentenv-rtk-deleg-skip-');
    const rtk = fakeRtkInit();
    const adapter = new RtkDelegationAdapter(
      { enabled: false, baseDir: home, rtkEnabled: true, rtkInit: rtk.fn },
      {
        agentKey: 'gemini_cli',
        label: 'Gemini CLI',
        rtkFlags: ['--gemini'],
        configDir: path.join(home, '.gemini'),
        expectedFile: 'RTK.md',
      },
    );
    const result = await adapter.initialize();
    assert.equal(result.success, true);
    assert.ok(result.message.includes('not enabled'));
    assert.deepEqual(rtk.calls, []);
  });

  describe('proactive version capability check (FEAT-09)', () => {
    it('skips the real rtk init call when a verified minimum version rules the agent out', async () => {
      const home = tempDir('agentenv-rtk-deleg-vercap-');
      const rtk = fakeRtkInit();
      RTK_AGENT_MIN_VERSIONS['test-agent'] = [999, 0, 0];
      try {
        const adapter = new RtkDelegationAdapter(
          {
            enabled: true,
            baseDir: home,
            rtkEnabled: true,
            rtkInit: rtk.fn,
            checkRtkInstallation: (): RtkInstallationCheck => ({
              resolvedPath: '/usr/local/bin/rtk',
              version: 'rtk 0.42.4',
              gainOk: true,
            }),
          },
          {
            agentKey: 'test-agent' as never,
            label: 'Test Agent',
            rtkFlags: ['--agent', 'test-agent'],
            configDir: path.join(home, '.test-agent'),
            expectedFile: 'RTK.md',
          },
        );

        const result = await adapter.initialize();

        assert.equal(result.success, false);
        assert.ok(result.errors.some((e) => e.includes('does not yet support')));
        assert.deepEqual(rtk.calls, [], 'the real rtk init call must never run');
      } finally {
        delete RTK_AGENT_MIN_VERSIONS['test-agent'];
      }
    });

    it('proceeds to the real rtk init call when the version check is inconclusive (unresolved rtk)', async () => {
      const home = tempDir('agentenv-rtk-deleg-vercap-');
      const rtk = fakeRtkInit();
      RTK_AGENT_MIN_VERSIONS['test-agent'] = [999, 0, 0];
      try {
        const adapter = new RtkDelegationAdapter(
          {
            enabled: true,
            baseDir: home,
            rtkEnabled: true,
            rtkInit: rtk.fn,
            checkRtkInstallation: (): RtkInstallationCheck => ({
              resolvedPath: null,
              version: null,
              gainOk: null,
            }),
          },
          {
            agentKey: 'test-agent' as never,
            label: 'Test Agent',
            rtkFlags: ['--agent', 'test-agent'],
            configDir: path.join(home, '.test-agent'),
            expectedFile: 'RTK.md',
          },
        );

        const result = await adapter.initialize();

        assert.equal(result.success, true);
        assert.equal(
          rtk.calls.length,
          1,
          'a null version is unknown, not a denial — must attempt init',
        );
      } finally {
        delete RTK_AGENT_MIN_VERSIONS['test-agent'];
      }
    });

    it('never probes rtk --version for an agent with no verified minimum (e.g. vibe today)', async () => {
      const home = tempDir('agentenv-rtk-deleg-vercap-');
      const rtk = fakeRtkInit();
      const adapter = new RtkDelegationAdapter(
        {
          enabled: true,
          baseDir: home,
          rtkEnabled: true,
          rtkInit: rtk.fn,
          checkRtkInstallation: (): RtkInstallationCheck => {
            throw new Error('must not probe rtk --version when no threshold is known');
          },
        },
        {
          agentKey: 'vibe',
          label: 'Mistral Vibe',
          rtkFlags: ['-g', '--agent', 'vibe'],
          configDir: path.join(home, '.vibe'),
          expectedFile: 'RTK.md',
        },
      );

      const result = await adapter.initialize();

      assert.equal(result.success, true);
      assert.equal(rtk.calls.length, 1);
    });
  });

  it('cleanup is a no-op', async () => {
    const adapter = new RtkDelegationAdapter(
      { enabled: true, baseDir: '/tmp', rtkEnabled: true },
      {
        agentKey: 'gemini_cli',
        label: 'Gemini CLI',
        rtkFlags: ['--gemini'],
        configDir: '/tmp/.gemini',
        expectedFile: 'RTK.md',
      },
    );
    const result = await adapter.cleanup();
    assert.equal(result.success, true);
    assert.equal(result.filesCreated.length, 0);
    assert.equal(result.filesModified.length, 0);
  });
});
