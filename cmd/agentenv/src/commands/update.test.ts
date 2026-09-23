import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { verifySummaryLine, toolAvailabilityLine, miseActivationHint } from '../toolchain/mise.js';
import type { ToolAvailability } from '../toolchain/mise.js';
import { doUpdate, watchMiseToml } from './update.js';
import type { UpdateDeps } from './update.js';

describe('update verify rendering', () => {
  it('renders a spaces-safe path and a single hint for mixed resolvability', () => {
    const scope = path.join('C:', 'Program Files', 'agentenv project');
    const miseTomlPath = path.join(scope, 'mise.toml');
    assert.ok(miseTomlPath.includes('Program Files'));
    assert.equal(path.basename(miseTomlPath), 'mise.toml');

    const availability: ToolAvailability[] = [
      { key: 'ripgrep', binary: 'rg', onPath: true, status: 'resolvable' },
      { key: 'git_delta', binary: 'delta', onPath: false, status: 'needs-new-terminal' },
    ];
    const summary = verifySummaryLine(availability);
    const lines = [
      summary,
      ...availability.map((tool) => toolAvailabilityLine(tool)),
      miseActivationHint(),
    ];
    assert.match(summary, /need a new terminal/);
    assert.equal(
      lines.filter((line) => line.includes('NEW terminal') || line.includes('mise activate'))
        .length,
      1,
    );
    assert.ok(!toolAvailabilityLine(availability[1]).includes('✗'));
  });
});

/** Poll `check` until it returns true or `timeoutMs` elapses. */
async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function withCapturedConsole<T>(
  run: () => Promise<T>,
): Promise<{ result: T; logs: string[]; errors: string[] }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (message?: unknown) => logs.push(String(message));
  console.error = (message?: unknown) => errors.push(String(message));
  try {
    const result = await run();
    return { result, logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

/** doUpdate() always resolves agentenv.toml relative to cwd — run `fn` chdir'd into `dir`. */
async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const originalCwd = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(originalCwd);
  }
}

function tempConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-update-'));
  fs.writeFileSync(path.join(dir, 'agentenv.toml'), content);
  return dir;
}

/** A full set of no-op-success stubs; individual tests override what they exercise. */
function happyDeps(overrides: UpdateDeps = {}): UpdateDeps {
  return {
    isMiseInstalled: () => true,
    getMiseVersion: () => '2026.1.1',
    ensureGlobalShimsDir: () => ({ success: true, message: 'shims dir already on PATH' }),
    runMiseSelfUpdate: async () => ({ success: true, output: 'mise 2026.1.1' }),
    trustMiseToml: () => ({ success: true, message: 'trusted' }),
    runMiseUpgrade: async () => ({ success: true, stdout: 'up to date', stderr: '', exitCode: 0 }),
    verifyToolAvailability: () => [],
    watchMiseToml: () => undefined,
    ...overrides,
  };
}

describe('doUpdate (SWEEP-09)', () => {
  it('reports mise-missing as a themed error and exits 1, without touching config resolution', async () => {
    const { errors } = await withCapturedConsole(() =>
      doUpdate({}, { isMiseInstalled: () => false }),
    );
    assert.ok(errors.some((line) => /mise was not found/.test(line)));
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  });

  it('exits 1 when no agentenv.toml can be found', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-update-'));
    // findConfigPath() falls back to the user-scope config, so this machine's
    // real ~/.config/agentenv/agentenv.toml (if any) must be scrubbed out —
    // point HOME/XDG_CONFIG_HOME at an empty dir instead.
    const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-update-home-'));
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    const originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.HOME = emptyHome;
    process.env.USERPROFILE = emptyHome;
    process.env.XDG_CONFIG_HOME = path.join(emptyHome, 'xdg');
    try {
      const { errors } = await withCwd(dir, () =>
        withCapturedConsole(() => doUpdate({}, happyDeps())),
      );
      assert.ok(errors.some((line) => /No agentenv\.toml found/.test(line)));
      assert.equal(process.exitCode, 1);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = originalXdg;
      process.exitCode = 0;
    }
  });

  it('a successful self + tools update calls every step and reports success', async () => {
    const dir = tempConfig('scope = "project"\n');
    fs.writeFileSync(path.join(dir, 'mise.toml'), '[tools]\n');
    const calls: string[] = [];
    const deps = happyDeps({
      ensureGlobalShimsDir: () => {
        calls.push('shims');
        return { success: true, message: 'ok' };
      },
      runMiseSelfUpdate: async () => {
        calls.push('self-update');
        return { success: true, output: 'up to date' };
      },
      trustMiseToml: () => {
        calls.push('trust');
        return { success: true, message: 'trusted' };
      },
      runMiseUpgrade: async (targets) => {
        calls.push(`upgrade:${targets.join(',')}`);
        return { success: true, stdout: 'ok', stderr: '', exitCode: 0 };
      },
    });

    const { logs } = await withCwd(dir, () =>
      withCapturedConsole(() => doUpdate({ scope: 'project' }, deps)),
    );

    assert.deepEqual(calls.slice(0, 3), ['shims', 'self-update', 'trust']);
    assert.ok(calls[3]?.startsWith('upgrade:'), `expected an upgrade call, got: ${calls[3]}`);
    assert.ok(logs.some((line) => line.includes('Update complete!')));
    assert.equal(process.exitCode, 0);
  });

  it('a failed self-update marks the run failed (exit 1)', async () => {
    const dir = tempConfig('scope = "project"\n[tools]\nripgrep = false\n');
    const { logs, errors } = await withCwd(dir, () =>
      withCapturedConsole(() =>
        doUpdate(
          { scope: 'project' },
          happyDeps({
            runMiseSelfUpdate: async () => ({ success: false, output: 'winget: not supported' }),
          }),
        ),
      ),
    );
    assert.ok(errors.some((line) => /mise self-update failed/.test(line)));
    assert.ok(logs.some((line) => line.includes('Update failed')));
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  });

  it('reports the tools step failing when mise.toml is missing (needs `agentenv apply` first)', async () => {
    const dir = tempConfig('scope = "project"\n');
    const { errors } = await withCwd(dir, () =>
      withCapturedConsole(() => doUpdate({ scope: 'project' }, happyDeps())),
    );
    assert.ok(errors.some((line) => /not found — run `agentenv apply` first/.test(line)));
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
  });

  it('--self only runs the self-update step, not the tools step', async () => {
    const dir = tempConfig('scope = "project"\n');
    const trustCalled = { value: false };
    await withCwd(dir, () =>
      withCapturedConsole(() =>
        doUpdate(
          { scope: 'project', self: true },
          happyDeps({
            trustMiseToml: () => {
              trustCalled.value = true;
              return { success: true, message: '' };
            },
          }),
        ),
      ),
    );
    assert.equal(trustCalled.value, false);
    process.exitCode = 0;
  });

  it('--tools only runs the tools step, not self-update', async () => {
    const dir = tempConfig('scope = "project"\n');
    fs.writeFileSync(path.join(dir, 'mise.toml'), '[tools]\n');
    const selfCalled = { value: false };
    await withCwd(dir, () =>
      withCapturedConsole(() =>
        doUpdate(
          { scope: 'project', tools: true },
          happyDeps({
            runMiseSelfUpdate: async () => {
              selfCalled.value = true;
              return { success: true, output: '' };
            },
          }),
        ),
      ),
    );
    assert.equal(selfCalled.value, false);
    process.exitCode = 0;
  });

  it('--dry-run never calls the real mutating mise functions', async () => {
    const dir = tempConfig('scope = "project"\n');
    fs.writeFileSync(path.join(dir, 'mise.toml'), '[tools]\n');
    const mutatingCalls: string[] = [];
    const { logs } = await withCwd(dir, () =>
      withCapturedConsole(() =>
        doUpdate(
          { scope: 'project', dryRun: true },
          happyDeps({
            ensureGlobalShimsDir: () => {
              mutatingCalls.push('shims');
              return { success: true, message: 'unexpected' };
            },
            runMiseSelfUpdate: async () => {
              mutatingCalls.push('self-update');
              return { success: true, output: 'unexpected' };
            },
            trustMiseToml: () => {
              mutatingCalls.push('trust');
              return { success: true, message: 'unexpected' };
            },
            runMiseUpgrade: async () => {
              mutatingCalls.push('upgrade');
              return { success: true, stdout: '', stderr: '', exitCode: 0 };
            },
          }),
        ),
      ),
    );
    assert.deepEqual(mutatingCalls, []);
    assert.ok(logs.some((line) => line.includes('Dry run complete')));
    process.exitCode = 0;
  });

  it('--json prints one parseable document with the same shape apply --json uses', async () => {
    const dir = tempConfig('scope = "project"\n');
    fs.writeFileSync(path.join(dir, 'mise.toml'), '[tools]\n');
    const { logs } = await withCwd(dir, () =>
      withCapturedConsole(() => doUpdate({ scope: 'project', json: true }, happyDeps())),
    );
    assert.equal(logs.length, 1, `expected exactly one console.log call, got: ${logs.length}`);
    const parsed = JSON.parse(logs[0]);
    assert.equal(parsed.success, true);
    assert.ok(Array.isArray(parsed.messages));
    assert.ok(Array.isArray(parsed.errors));
    process.exitCode = 0;
  });
});

describe('watchMiseToml (BUG-13)', () => {
  it('detects an atomic-rename save (editor-style) and re-reads agentenv.toml fresh each time', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-watch-'));
    const configPath = path.join(dir, 'agentenv.toml');
    const miseTomlPath = path.join(dir, 'mise.toml');
    // Every Tier 1/2 tool explicitly disabled: getUpgradeableTools() returns
    // [], so the trigger path never has to spawn a real `mise up`.
    fs.writeFileSync(
      configPath,
      [
        'scope = "project"',
        '[tools]',
        'ripgrep = false',
        'fd = false',
        'jq = false',
        'rtk = false',
        'ast_grep = false',
        'git_delta = false',
        'gh = false',
        'difftastic = false',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(miseTomlPath, '[tools]\n');

    const logs: string[] = [];
    const errors: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (message?: unknown) => logs.push(String(message));
    console.error = (message?: unknown) => errors.push(String(message));

    const watcher = watchMiseToml(miseTomlPath, dir, configPath, 50);
    assert.ok(watcher, 'watchMiseToml should return a live watcher');

    try {
      // Simulate an editor's atomic-rename save: write a temp file, then
      // rename it over mise.toml — this is what made the old file-specific
      // watch stop firing.
      const tmpPath = `${miseTomlPath}.tmp`;
      fs.writeFileSync(tmpPath, '[tools]\n# touched\n');
      fs.renameSync(tmpPath, miseTomlPath);

      await waitFor(() => logs.some((line) => line.includes('No upgradeable tools')));

      // Now make agentenv.toml itself unparsable and trigger another save.
      // The only way the watcher can report this is by re-reading the file
      // fresh on THIS trigger — a stale, captured-at-start config could
      // never produce this error.
      fs.writeFileSync(configPath, '[agents\nbroken');
      const tmpPath2 = `${miseTomlPath}.tmp2`;
      fs.writeFileSync(tmpPath2, '[tools]\n# touched again\n');
      fs.renameSync(tmpPath2, miseTomlPath);

      await waitFor(() => errors.some((line) => line.includes('Could not re-read')));
    } finally {
      watcher?.close();
      console.log = originalLog;
      console.error = originalError;
    }
  });
});
