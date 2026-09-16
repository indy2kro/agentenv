import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodexCliAdapter } from './codex.js';
import { CopilotAdapter } from './copilot.js';
import { OpenCodeAdapter } from './opencode.js';
import { GeminiCliAdapter } from './gemini.js';
import { CursorAdapter } from './cursor.js';
import { WindsurfAdapter } from './windsurf.js';
import { ClineAdapter } from './cline.js';
import { VibeAdapter } from './vibe.js';
import type { RtkInitFn } from '../toolchain/rtk.js';
import { rtkMessage } from '../toolchain/rtk.js';

interface RtkCall {
  args: string[];
  cwd: string;
}

/**
 * A fake `rtk init` that records argv and writes the files verified for the
 * real rtk 0.42.4 (see docs/research/rtk-init-delegation.md).
 */
function fakeRtkInit(): { fn: RtkInitFn; calls: RtkCall[] } {
  const calls: RtkCall[] = [];
  const fn: RtkInitFn = (args, cwd) => {
    calls.push({ args, cwd });
    const joined = args.join(' ');
    if (joined === '--codex') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK\n\nToken-optimized CLI proxy.\n');
    } else if (joined === '--copilot') {
      fs.mkdirSync(path.join(cwd, '.github', 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.github', 'copilot-instructions.md'), '# Copilot\n');
      fs.writeFileSync(
        path.join(cwd, '.github', 'hooks', 'rtk-rewrite.json'),
        '{"version":1,"hooks":{"PreToolUse":[{"command":"rtk hook copilot"}]}}\n',
      );
    } else if (joined === '-g --opencode') {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const dir = path.join(home, '.config', 'opencode', 'plugins');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'rtk.ts'), 'export const rtkPlugin = true;\n');
    } else if (joined === '--gemini') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Gemini CLI)\n');
    } else if (joined === '--agent cursor') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Cursor)\n');
    } else if (joined === '--agent windsurf') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Windsurf)\n');
    } else if (joined === '--agent cline') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Cline CLI)\n');
    } else if (joined === '--agent vibe') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Mistral Vibe)\n');
    } else {
      calls[calls.length - 1].args = ['UNEXPECTED', ...args];
    }
    return { success: true, message: `rtk init ${joined} succeeded`, stdout: '', stderr: '' };
  };
  return { fn, calls };
}

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-adapter-'));
}

function withHome(home: string, run: () => Promise<void>): Promise<void> {
  const priorHome = process.env.HOME;
  process.env.HOME = home;
  return run().finally(() => {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
  });
}

describe('Codex CLI adapter', () => {
  it('creates config.toml and delegates hooks to `rtk init --codex`', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const rtk = fakeRtkInit();
      const adapter = new CodexCliAdapter({
        enabled: true,
        baseDir: home,
        rtkEnabled: true,
        rtkInit: rtk.fn,
      });
      const result = await adapter.initialize();

      assert.equal(result.success, true);
      // Baseline config.toml without hooks.json (delegation instead)
      assert.match(
        fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8'),
        /hooks = true/,
      );
      assert.equal(fs.existsSync(path.join(home, '.codex', 'hooks.json')), false);
      // Delegated RTK.md written in the project dir
      assert.equal(fs.existsSync(path.join(home, 'RTK.md')), true);
      assert.deepEqual(rtk.calls, [{ args: ['--codex'], cwd: home }]);
    });
  });

  it('does not delegate hooks when rtk is disabled', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const rtk = fakeRtkInit();
      const adapter = new CodexCliAdapter({
        enabled: true,
        baseDir: home,
        rtkEnabled: false,
        rtkInit: rtk.fn,
      });
      await adapter.initialize();

      assert.equal(fs.existsSync(path.join(home, '.codex', 'config.toml')), true);
      assert.equal(fs.existsSync(path.join(home, 'RTK.md')), false);
      assert.equal(rtk.calls.length, 0);
    });
  });
});

describe('GitHub Copilot adapter', () => {
  it('delegates hooks to `rtk init --copilot` and reports the .github files', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const rtk = fakeRtkInit();
      const adapter = new CopilotAdapter({
        enabled: true,
        baseDir: home,
        rtkEnabled: true,
        rtkInit: rtk.fn,
      });
      const result = await adapter.initialize();

      assert.equal(result.success, true);
      assert.equal(fs.existsSync(path.join(home, '.github', 'copilot-instructions.md')), true);
      assert.equal(fs.existsSync(path.join(home, '.github', 'hooks', 'rtk-rewrite.json')), true);
      assert.deepEqual(rtk.calls, [{ args: ['--copilot'], cwd: home }]);
    });
  });

  it('does not delegate hooks when rtk is disabled', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const rtk = fakeRtkInit();
      const adapter = new CopilotAdapter({
        enabled: true,
        baseDir: home,
        rtkEnabled: false,
        rtkInit: rtk.fn,
      });
      const result = await adapter.initialize();

      assert.equal(result.success, true);
      assert.equal(fs.existsSync(path.join(home, '.github', 'copilot-instructions.md')), false);
      assert.equal(rtk.calls.length, 0);
    });
  });
});

describe('OpenCode adapter', () => {
  it('delegates plugin install to `rtk init -g --opencode`', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const rtk = fakeRtkInit();
      const adapter = new OpenCodeAdapter({
        enabled: true,
        baseDir: home,
        rtkEnabled: true,
        rtkInit: rtk.fn,
      });
      const result = await adapter.initialize();

      assert.equal(result.success, true);
      assert.equal(
        fs.existsSync(path.join(home, '.config', 'opencode', 'plugins', 'rtk.ts')),
        true,
      );
      assert.equal(
        fs.existsSync(path.join(home, '.config', 'opencode', 'plugins', 'rtk-optimizer.js')),
        false,
      );
      assert.deepEqual(rtk.calls, [{ args: ['-g', '--opencode'], cwd: home }]);
    });
  });

  it('does not install the plugin when rtk is disabled', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const rtk = fakeRtkInit();
      const adapter = new OpenCodeAdapter({
        enabled: true,
        baseDir: home,
        rtkEnabled: false,
        rtkInit: rtk.fn,
      });
      const result = await adapter.initialize();

      assert.equal(result.success, true);
      assert.equal(
        fs.existsSync(path.join(home, '.config', 'opencode', 'plugins', 'rtk.ts')),
        false,
      );
      assert.equal(rtk.calls.length, 0);
    });
  });
});

describe('delegation failure path', () => {
  it('surfaces a failed rtk init as an adapter error', async () => {
    await withHome(tempHome(), async () => {
      const home = process.env.HOME as string;
      const failing: RtkInitFn = (args, _cwd) => ({
        success: false,
        message: `rtk init ${args.join(' ')} failed (exit 1)`,
        stdout: '',
        stderr: 'not configured yet',
      });
      const adapter = new CodexCliAdapter({
        enabled: true,
        baseDir: home,
        rtkEnabled: true,
        rtkInit: failing,
      });
      const result = await adapter.initialize();

      assert.equal(result.success, false);
      assert.ok(result.errors.some((e) => e.includes('not configured yet')));
    });
  });
});

describe('rtkMessage transparency log', () => {
  it('relays what rtk rewrote, collapses whitespace, and elides long output', () => {
    assert.equal(
      rtkMessage({
        success: true,
        message: 'rtk init --codex succeeded',
        stdout: 'patched AGENTS.md\nadded RTK.md',
        stderr: '',
      }),
      'rtk init --codex succeeded: patched AGENTS.md added RTK.md',
    );
    assert.equal(
      rtkMessage({
        success: true,
        message: 'rtk init --codex succeeded',
        stdout: '',
        stderr: '',
      }),
      'rtk init --codex succeeded',
    );
    const long = 'x'.repeat(600);
    const message = rtkMessage({
      success: true,
      message: 'm',
      stdout: long,
      stderr: '',
    });
    assert.ok(message.endsWith('...'), 'long rewrote output is elided');
    assert.ok(message.length < 430, 'elided message stays bounded');
  });
});

for (const [label, AdapterCtor, rtkFlags, configDirName] of [
  ['Gemini CLI', GeminiCliAdapter, ['--gemini'], '.gemini'],
  ['Cursor', CursorAdapter, ['--agent', 'cursor'], '.cursor'],
  ['Windsurf', WindsurfAdapter, ['--agent', 'windsurf'], '.windsurf'],
  ['Cline CLI', ClineAdapter, ['--agent', 'cline'], '.cline'],
  ['Mistral Vibe', VibeAdapter, ['--agent', 'vibe'], '.vibe'],
] as const) {
  describe(`${label} adapter`, () => {
    it('delegates hooks to rtk init and creates configDir', async () => {
      await withHome(tempHome(), async () => {
        const home = process.env.HOME as string;
        const rtk = fakeRtkInit();
        const adapter = new AdapterCtor({
          enabled: true,
          baseDir: home,
          rtkEnabled: true,
          rtkInit: rtk.fn,
        });
        const result = await adapter.initialize();

        assert.equal(result.success, true);
        assert.ok(result.message.includes('rtk init'));
        assert.ok(fs.existsSync(path.join(home, configDirName)));
        assert.ok(fs.existsSync(path.join(home, 'RTK.md')));
        assert.deepEqual(rtk.calls, [{ args: rtkFlags, cwd: home }]);
        assert.equal(adapter.getName(), label);
      });
    });

    it('does not call rtk when rtkEnabled is false', async () => {
      await withHome(tempHome(), async () => {
        const home = process.env.HOME as string;
        const rtk = fakeRtkInit();
        const adapter = new AdapterCtor({
          enabled: true,
          baseDir: home,
          rtkEnabled: false,
          rtkInit: rtk.fn,
        });
        await adapter.initialize();
        assert.deepEqual(rtk.calls, []);
      });
    });

    it('cleanup is a no-op', async () => {
      const adapter = new AdapterCtor({ enabled: true, baseDir: '/tmp', rtkEnabled: true });
      const result = await adapter.cleanup();
      assert.equal(result.success, true);
      assert.equal(result.filesCreated.length, 0);
    });
  });
}
