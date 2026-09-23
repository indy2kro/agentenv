import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RTK_AGENT_MIN_VERSIONS,
  RTK_INIT_FLAGS,
  checkRtkInstallation,
  compareRtkVersions,
  isRtkAgentSupportedByVersion,
  isUnsupportedRtkAgentError,
  parseRtkVersion,
  resolveRtkBinary,
  resolveRtkInit,
  rtkMessage,
} from './rtk.js';
import { AGENT_KEYS } from '../config/schema.js';
import type { runMiseCaptured } from './mise.js';

const rtkStub = fileURLToPath(new URL('../../test/fixtures/rtk-stub.mjs', import.meta.url));

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

  it('also recognizes the version-verified-unsupported synthetic message (FEAT-09)', () => {
    assert.equal(
      isUnsupportedRtkAgentError(
        ['rtk 0.42.4 does not yet support "vibe" as an --agent value'],
        'vibe',
      ),
      true,
    );
  });
});

describe('parseRtkVersion (FEAT-09)', () => {
  it('extracts the leading X.Y.Z from rtk --version output', () => {
    assert.deepEqual(parseRtkVersion('rtk 0.42.4'), [0, 42, 4]);
    assert.deepEqual(parseRtkVersion('0.49.0'), [0, 49, 0]);
  });

  it('returns null for null, empty, or unparseable input', () => {
    assert.equal(parseRtkVersion(null), null);
    assert.equal(parseRtkVersion(''), null);
    assert.equal(parseRtkVersion('not a version'), null);
  });
});

describe('compareRtkVersions (FEAT-09)', () => {
  it('compares major, then minor, then patch', () => {
    assert.equal(compareRtkVersions([0, 42, 4], [0, 49, 0]), -1);
    assert.equal(compareRtkVersions([0, 49, 0], [0, 42, 4]), 1);
    assert.equal(compareRtkVersions([1, 0, 0], [0, 99, 99]), 1);
    assert.equal(compareRtkVersions([0, 49, 0], [0, 49, 0]), 0);
  });
});

describe('isRtkAgentSupportedByVersion (FEAT-09)', () => {
  it('returns null (unknown) for an agent with no verified minimum, e.g. vibe today', () => {
    assert.equal(RTK_AGENT_MIN_VERSIONS.vibe, undefined);
    assert.equal(isRtkAgentSupportedByVersion('vibe', '0.42.4'), null);
    assert.equal(isRtkAgentSupportedByVersion('vibe', null), null);
  });

  it('returns null when a threshold exists but the version is unparseable', () => {
    const withThreshold: Partial<Record<string, [number, number, number]>> = {
      'test-agent': [1, 0, 0],
    };
    assert.equal(RTK_AGENT_MIN_VERSIONS['test-agent'], undefined);
    Object.assign(RTK_AGENT_MIN_VERSIONS, withThreshold);
    try {
      assert.equal(isRtkAgentSupportedByVersion('test-agent', 'garbage'), null);
      assert.equal(isRtkAgentSupportedByVersion('test-agent', '0.9.9'), false);
      assert.equal(isRtkAgentSupportedByVersion('test-agent', '1.0.0'), true);
      assert.equal(isRtkAgentSupportedByVersion('test-agent', '1.2.0'), true);
    } finally {
      delete RTK_AGENT_MIN_VERSIONS['test-agent'];
    }
  });
});

describe('resolveRtkBinary', () => {
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

describe('checkRtkInstallation', () => {
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

  it('leaves version null when `rtk --version` exits non-zero with no output', () => {
    const info = checkRtkInstallation('/project', {
      resolveRtkBinary: () => '/usr/local/bin/rtk',
      spawnSync: ((cmd: string, args: string[]) => {
        if (args[0] === '--version') return { status: 1, stdout: '', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      }) as typeof import('child_process').spawnSync,
    });
    assert.equal(info.version, null);
    assert.equal(info.gainOk, true);
  });

  it('leaves version null and gainOk false when spawnSync throws for either probe', () => {
    const info = checkRtkInstallation('/project', {
      resolveRtkBinary: () => '/usr/local/bin/rtk',
      spawnSync: (() => {
        throw new Error('ENOENT');
      }) as unknown as typeof import('child_process').spawnSync,
    });
    assert.equal(info.version, null);
    assert.equal(info.gainOk, false);
  });
});

describe('rtkMessage', () => {
  it('returns the bare message when rtk produced no stdout', () => {
    assert.equal(
      rtkMessage({ success: true, message: 'rtk init --codex succeeded', stdout: '', stderr: '' }),
      'rtk init --codex succeeded',
    );
  });

  it('appends a whitespace-collapsed summary of stdout when present', () => {
    const message = rtkMessage({
      success: true,
      message: 'rtk init --codex succeeded',
      stdout: 'wrote  RTK.md\n  and   one more file\n',
      stderr: '',
    });
    assert.equal(message, 'rtk init --codex succeeded: wrote RTK.md and one more file');
  });

  it('truncates a long stdout summary to 400 chars with an ellipsis', () => {
    const longStdout = 'x'.repeat(500);
    const message = rtkMessage({
      success: true,
      message: 'rtk init --codex succeeded',
      stdout: longStdout,
      stderr: '',
    });
    const summary = message.slice('rtk init --codex succeeded: '.length);
    assert.equal(summary.length, 403); // 400 chars + '...'
    assert.ok(summary.endsWith('...'));
  });
});

describe('resolveRtkInit', () => {
  it('returns the given function unchanged when one is injected', () => {
    const fake = (() => ({
      success: true,
      message: 'stub',
      stdout: '',
      stderr: '',
    })) as unknown as ReturnType<typeof resolveRtkInit>;
    assert.equal(resolveRtkInit(fake), fake);
  });

  it('defaults to a real rtk-init function that succeeds via the AGENTENV_RTK_BIN stub', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-rtk-init-'));
    const prior = process.env.AGENTENV_RTK_BIN;
    process.env.AGENTENV_RTK_BIN = rtkStub;
    try {
      const result = resolveRtkInit()(['--codex'], cwd);
      assert.equal(result.success, true);
      assert.match(result.stdout, /rtk init --codex succeeded/);
      assert.equal(fs.existsSync(path.join(cwd, 'RTK.md')), true);
    } finally {
      if (prior === undefined) delete process.env.AGENTENV_RTK_BIN;
      else process.env.AGENTENV_RTK_BIN = prior;
    }
  });

  it('reports failure via the stub for an unrecognized flag combination', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-rtk-init-'));
    const prior = process.env.AGENTENV_RTK_BIN;
    process.env.AGENTENV_RTK_BIN = rtkStub;
    try {
      const result = resolveRtkInit()(['--not-a-real-flag'], cwd);
      assert.equal(result.success, false);
      assert.match(result.message, /failed \(exit 1\)/);
    } finally {
      if (prior === undefined) delete process.env.AGENTENV_RTK_BIN;
      else process.env.AGENTENV_RTK_BIN = prior;
    }
  });
});
