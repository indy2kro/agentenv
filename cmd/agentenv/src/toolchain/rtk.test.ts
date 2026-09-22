import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RTK_INIT_FLAGS,
  checkRtkInstallation,
  isUnsupportedRtkAgentError,
  resolveRtkBinary,
} from './rtk.js';
import { AGENT_KEYS } from '../config/schema.js';
import type { runMiseCaptured } from './mise.js';

describe('RTK_INIT_FLAGS', () => {
  it('covers every agent key', () => {
    for (const key of AGENT_KEYS) {
      const flags = RTK_INIT_FLAGS[key];
      assert.ok(
        Array.isArray(flags) && flags.length > 0,
        `RTK_INIT_FLAGS missing or empty for ${key}`,
      );
    }
  });

  it('maps the five delegated agents to their correct rtk init flags', () => {
    // -g is mandatory for the global-only agents: real rtk 0.49.0 rejects
    // project-scoped init for them (surfaced by the smoke:real all-9 run).
    assert.deepEqual(RTK_INIT_FLAGS.gemini_cli, ['-g', '--gemini']);
    assert.deepEqual(RTK_INIT_FLAGS.cursor, ['-g', '--agent', 'cursor']);
    assert.deepEqual(RTK_INIT_FLAGS.windsurf, ['-g', '--agent', 'windsurf']);
    assert.deepEqual(RTK_INIT_FLAGS.cline, ['--agent', 'cline']);
    assert.deepEqual(RTK_INIT_FLAGS.vibe, ['-g', '--agent', 'vibe']);
  });
});

describe('isUnsupportedRtkAgentError', () => {
  it('recognizes rtk clap-style "invalid value" rejection for the given agent', () => {
    const errors = [
      "rtk init -g --agent vibe failed (exit 2): error: invalid value 'vibe' for '--agent <AGENT>'\n\n  [possible values: claude, cursor, windsurf, cline, kilocode, antigravity, pi, hermes]",
    ];
    assert.equal(isUnsupportedRtkAgentError(errors, 'vibe'), true);
  });

  it('does not misfire on unrelated rtk failures', () => {
    assert.equal(isUnsupportedRtkAgentError(['rtk binary not found on PATH'], 'vibe'), false);
    assert.equal(
      isUnsupportedRtkAgentError(["invalid value 'cline' for '--agent <AGENT>'"], 'vibe'),
      false,
    );
  });
});

describe('resolveRtkBinary (BUG-05)', () => {
  it('prefers the mise-managed rtk over a bare PATH lookup', () => {
    const calls: Array<{ args: string[]; cwd?: string }> = [];
    const fakeRunMiseCaptured: typeof runMiseCaptured = (args, opts) => {
      calls.push({ args, cwd: opts?.cwd });
      return { status: 0, stdout: '/mise/shims/rtk\n', stderr: '' };
    };
    const fakeResolveBinary = () => {
      throw new Error('must not fall back to a bare PATH lookup when mise resolves rtk');
    };

    const resolved = resolveRtkBinary('/project', {
      runMiseCaptured: fakeRunMiseCaptured,
      resolveBinary: fakeResolveBinary,
    });

    assert.equal(resolved, '/mise/shims/rtk');
    assert.deepEqual(calls, [{ args: ['which', 'rtk'], cwd: '/project' }]);
  });

  it('falls back to a bare PATH lookup when `mise which rtk` fails', () => {
    const fakeRunMiseCaptured: typeof runMiseCaptured = () => ({
      status: 1,
      stdout: '',
      stderr: 'rtk is not installed',
    });
    const fakeResolveBinary = () => '/usr/local/bin/rtk';

    const resolved = resolveRtkBinary('/project', {
      runMiseCaptured: fakeRunMiseCaptured,
      resolveBinary: fakeResolveBinary,
    });

    assert.equal(resolved, '/usr/local/bin/rtk');
  });

  it('falls back to a bare PATH lookup when `mise which rtk` prints nothing', () => {
    const fakeRunMiseCaptured: typeof runMiseCaptured = () => ({
      status: 0,
      stdout: '   \n',
      stderr: '',
    });
    const fakeResolveBinary = () => '/usr/local/bin/rtk';

    const resolved = resolveRtkBinary('/project', {
      runMiseCaptured: fakeRunMiseCaptured,
      resolveBinary: fakeResolveBinary,
    });

    assert.equal(resolved, '/usr/local/bin/rtk');
  });
});

describe('checkRtkInstallation (FEAT-02)', () => {
  it('reports null everywhere when rtk cannot be resolved at all', () => {
    const info = checkRtkInstallation('/project', {
      resolveRtkBinary: () => null,
      spawnSync: () => {
        throw new Error('must not spawn anything when nothing resolved');
      },
    });
    assert.deepEqual(info, { resolvedPath: null, version: null, gainOk: null });
  });

  it('reports version and a passing `rtk gain` for a healthy install', () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const info = checkRtkInstallation('/project', {
      resolveRtkBinary: () => '/mise/shims/rtk',
      spawnSync: ((cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        if (args[0] === '--version') return { status: 0, stdout: 'rtk 0.49.0\n', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      }) as typeof import('child_process').spawnSync,
    });
    assert.equal(info.resolvedPath, '/mise/shims/rtk');
    assert.equal(info.version, 'rtk 0.49.0');
    assert.equal(info.gainOk, true);
    assert.deepEqual(
      calls.map((call) => call.args[0]),
      ['--version', 'gain'],
    );
  });

  it('flags a failing `rtk gain` — the documented Rust Type Kit name-collision signal', () => {
    const info = checkRtkInstallation('/project', {
      resolveRtkBinary: () => '/usr/local/bin/rtk',
      spawnSync: (() => ({
        status: 1,
        stdout: '',
        stderr: 'error: unrecognized subcommand',
        pid: 0,
        output: [],
        signal: null,
      })) as unknown as typeof import('child_process').spawnSync,
    });
    assert.equal(info.gainOk, false);
  });
});
