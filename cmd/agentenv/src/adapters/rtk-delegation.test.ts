import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RtkDelegationAdapter } from './rtk-delegation.js';
import type { RtkInitFn } from '../toolchain/rtk.js';
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
