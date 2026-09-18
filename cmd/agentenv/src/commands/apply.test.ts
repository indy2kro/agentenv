import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyConfiguration } from './apply.js';
import type { AgentenvConfig } from '../config/schema.js';
import type { ClaudeCliRunner } from '../integrations/superpowers.js';
import type { RtkInitFn } from '../toolchain/rtk.js';

interface RtkCall {
  args: string[];
  cwd: string;
}

/**
 * Fake `rtk init` mirroring verified rtk 0.42.4 output files, deterministic so
 * a second apply is byte-identical.
 */
function fakeRtkInit(): { fn: RtkInitFn; calls: RtkCall[] } {
  const calls: RtkCall[] = [];
  const fn: RtkInitFn = (args, cwd) => {
    calls.push({ args, cwd });
    const joined = args.join(' ');
    if (joined === '--codex') {
      fs.writeFileSync(
        path.join(cwd, 'RTK.md'),
        '# RTK (Codex CLI)\n\nAlways prefix shell commands with `rtk`.\n',
      );
    } else if (joined === '--copilot') {
      fs.mkdirSync(path.join(cwd, '.github', 'hooks'), { recursive: true });
      fs.writeFileSync(
        path.join(cwd, '.github', 'copilot-instructions.md'),
        '# Copilot instructions\n',
      );
      fs.writeFileSync(
        path.join(cwd, '.github', 'hooks', 'rtk-rewrite.json'),
        `{
  "version": 1,
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "rtk hook copilot",
        "cwd": ".",
        "timeout": 5
      }
    ]
  }
}
`,
      );
    } else if (joined === '-g --opencode') {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      const pluginsDir = path.join(home, '.config', 'opencode', 'plugins');
      fs.mkdirSync(pluginsDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginsDir, 'rtk.ts'),
        '// rtk opencode plugin\nexport const plugin = {};\n',
      );
    } else if (joined === '-g --gemini') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Gemini CLI)\n');
    } else if (joined === '-g --agent cursor') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Cursor)\n');
    } else if (joined === '-g --agent windsurf') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Windsurf)\n');
    } else if (joined === '--agent cline') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Cline CLI)\n');
    } else if (joined === '-g --agent vibe') {
      fs.writeFileSync(path.join(cwd, 'RTK.md'), '# RTK (Mistral Vibe)\n');
    }
    return { success: true, message: `rtk init ${joined} succeeded`, stdout: '', stderr: '' };
  };
  return { fn, calls };
}

/**
 * Fake `claude plugin` runner. `plugin list` reports superpowers installed
 * after `plugin install` has run (tracked in memory), matching what the real
 * CLI would produce after a first `apply`.
 */
function fakeClaudeCli(): { fn: ClaudeCliRunner; calls: string[][] } {
  const calls: string[][] = [];
  let installed = false;
  const fn: ClaudeCliRunner = (args, _cwd) => {
    const joined = args.join(' ');
    calls.push(args);
    if (joined === 'plugin list') {
      return {
        success: true,
        exitCode: installed ? 0 : 1,
        stdout: installed ? 'superpowers@superpowers-marketplace' : '',
        stderr: '',
      };
    }
    if (joined.startsWith('plugin marketplace add '))
      return { success: true, exitCode: 0, stdout: '', stderr: '' };
    if (joined.startsWith('plugin install ')) {
      installed = true;
      return { success: true, exitCode: 0, stdout: '', stderr: '' };
    }
    return { success: true, exitCode: 0, stdout: '', stderr: '' };
  };
  return { fn, calls };
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function snapshot(roots: string[]): Map<string, string> {
  const snap = new Map<string, string>();
  for (const root of roots) {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          snap.set(path.join(root, path.relative(root, full)), fs.readFileSync(full, 'utf-8'));
        }
      }
    };
    walk(root);
  }
  return snap;
}

const CONFIG: AgentenvConfig = {
  scope: 'project',
  agents: { claude_code: true, codex_cli: true, copilot: true, opencode: true },
  tools: { ripgrep: true, fd: true, jq: true, rtk: true },
  rtk: {
    enabled: true,
    init: { claude_code: true, codex_cli: true, copilot: true, opencode: true },
  },
  tier0: { check_enabled: true },
  generate: {
    marker_start: '<!-- agentenv-managed-start -->',
    marker_end: '<!-- agentenv-managed-end -->',
    files: ['AGENTS.md', 'CLAUDE.md'],
  },
};

describe('apply pipeline', () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  after(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
  });

  it('generates all expected files and delegates each agent to rtk init once', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const rtk = fakeRtkInit();

    const result = await applyConfiguration(CONFIG, base, {
      skipMiseInstall: true,
      rtkInit: rtk.fn,
    });
    assert.equal(result.success, true, result.errors.join('; '));

    // agentenv-generated baseline + instructions
    for (const file of ['mise.toml', 'AGENTS.md', 'CLAUDE.md']) {
      assert.ok(fs.existsSync(path.join(base, file)), `missing ${file}`);
    }
    assert.ok(
      fs.existsSync(path.join(home, '.claude', 'settings.json')),
      'missing claude settings',
    );
    assert.ok(fs.existsSync(path.join(home, '.codex', 'config.toml')), 'missing codex config');

    // rtk-delegated outputs
    assert.ok(fs.existsSync(path.join(base, 'RTK.md')), 'missing RTK.md (codex)');
    assert.ok(
      fs.existsSync(path.join(base, '.github', 'copilot-instructions.md')),
      'missing copilot instructions',
    );
    assert.ok(
      fs.existsSync(path.join(base, '.github', 'hooks', 'rtk-rewrite.json')),
      'missing copilot hook config',
    );
    assert.ok(
      fs.existsSync(path.join(home, '.config', 'opencode', 'plugins', 'rtk.ts')),
      'missing opencode plugin',
    );

    // exactly one delegation per agent with the verified flags
    assert.deepEqual(
      rtk.calls.sort((a, b) => a.args[0].localeCompare(b.args[0])).map((c) => c.args),
      [['--codex'], ['--copilot'], ['-g', '--opencode']],
    );
    assert.ok(rtk.calls.every((c) => c.cwd === base));
  });

  it('is idempotent: a second apply changes nothing on disk and re-delegates safely', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const rtk = fakeRtkInit();

    const first = await applyConfiguration(CONFIG, base, {
      skipMiseInstall: true,
      rtkInit: rtk.fn,
    });
    assert.equal(first.success, true, first.errors.join('; '));
    const before = snapshot([base, home]);

    const second = await applyConfiguration(CONFIG, base, {
      skipMiseInstall: true,
      rtkInit: rtk.fn,
    });
    assert.equal(second.success, true, second.errors.join('; '));
    const afterMap = snapshot([base, home]);

    assert.equal(afterMap.size, before.size, 'file count changed between applies');
    const beforeSorted = [...before.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const afterSorted = [...afterMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (let i = 0; i < beforeSorted.length; i++) {
      assert.equal(afterSorted[i]?.[0], beforeSorted[i]?.[0], `path differs at index ${i}`);
      assert.equal(
        afterSorted[i]?.[1],
        beforeSorted[i]?.[1],
        `content differs for ${beforeSorted[i]?.[0]}`,
      );
    }
    assert.deepEqual(rtk.calls.length, 6, 'both applies delegated once per agent');
  });

  it('preserves user content in codex config.toml across applies', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const rtk = fakeRtkInit();

    const codexDir = path.join(home, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    const userConfig = '[model]\nwire_api = true\n';
    fs.writeFileSync(path.join(codexDir, 'config.toml'), userConfig);

    const result = await applyConfiguration(CONFIG, base, {
      skipMiseInstall: true,
      rtkInit: rtk.fn,
    });
    assert.equal(result.success, true, result.errors.join('; '));

    const final = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf-8');
    // The Tier 0 shell fix legitimately appends [windows] shell_path on Windows;
    // on POSIX it is a no-op. Either way the user's section must survive intact.
    assert.ok(
      final.includes('[model]') && final.includes('wire_api = true'),
      `user content was clobbered:\n${final}`,
    );
    if (process.platform !== 'win32') {
      assert.equal(final, userConfig);
    }
  });

  it('does not delegate any rtk init when rtk is disabled', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const rtk = fakeRtkInit();

    const config: AgentenvConfig = {
      ...CONFIG,
      rtk: { ...CONFIG.rtk!, enabled: false },
    };

    const result = await applyConfiguration(config, base, {
      skipMiseInstall: true,
      rtkInit: rtk.fn,
    });
    assert.equal(result.success, true, result.errors.join('; '));
    assert.equal(rtk.calls.length, 0);
    assert.equal(fs.existsSync(path.join(base, 'RTK.md')), false);
  });

  it("warns (does not fail) when rtk's own --agent enum rejects a value, e.g. Vibe on rtk 0.49.0", async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    // Mirrors the real rtk 0.49.0 clap error: --agent has no "vibe" value.
    const rtkInit: RtkInitFn = (args) => {
      const joined = args.join(' ');
      return {
        success: false,
        message: `rtk init ${joined} failed (exit 2)`,
        stdout: '',
        stderr:
          "error: invalid value 'vibe' for '--agent <AGENT>'\n\n  [possible values: claude, cursor, windsurf, cline, kilocode, antigravity, pi, hermes]",
      };
    };

    const config: AgentenvConfig = {
      ...CONFIG,
      agents: { vibe: true },
      rtk: { enabled: true, init: {} },
    };

    const result = await applyConfiguration(config, base, { skipMiseInstall: true, rtkInit });

    assert.equal(result.success, true, result.errors.join('; '));
    assert.ok(
      result.messages.some((m) => m.includes('Mistral Vibe') && m.includes('skipped')),
      `expected a skip message, got: ${result.messages.join('; ')}`,
    );
    assert.equal(
      result.errors.some((e) => e.includes('Mistral Vibe')),
      false,
    );
  });

  it('installs the Superpowers integration for Claude Code when enabled and allow_hooks', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const rtk = fakeRtkInit();
    const claude = fakeClaudeCli();

    const config: AgentenvConfig = {
      ...CONFIG,
      integrations: {
        superpowers: {
          enabled: true,
          source: 'github:obra/superpowers',
          ref: 'v6.3.0',
          allow_hooks: true,
        },
      },
    };

    const result = await applyConfiguration(config, base, {
      skipMiseInstall: true,
      rtkInit: rtk.fn,
      superpowersDeps: { runClaudeCli: claude.fn },
    });
    assert.equal(result.success, true, result.errors.join('; '));

    assert.ok(
      claude.calls.some((c) => c[0] === 'plugin' && c[1] === 'marketplace' && c[2] === 'add'),
    );
    assert.ok(claude.calls.some((c) => c[0] === 'plugin' && c[1] === 'install'));
    assert.ok(
      fs.existsSync(path.join(base, '.agentenv-state', 'integrations', 'superpowers.json')),
      'missing superpowers marker',
    );
    assert.ok(
      result.messages.some((m) => m.startsWith('Superpowers: ✓ claude_code: installed')),
      `missing success message: ${result.messages.join(' | ')}`,
    );
  });

  it('does not install Superpowers when allow_hooks is not enabled, and warns', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const rtk = fakeRtkInit();
    const claude = fakeClaudeCli();

    const config: AgentenvConfig = {
      ...CONFIG,
      integrations: {
        superpowers: {
          enabled: true,
          source: 'github:obra/superpowers',
          ref: 'v6.3.0',
          allow_hooks: false,
        },
      },
    };

    const result = await applyConfiguration(config, base, {
      skipMiseInstall: true,
      rtkInit: rtk.fn,
      superpowersDeps: { runClaudeCli: claude.fn },
    });
    assert.equal(result.success, true, result.errors.join('; '));
    assert.equal(
      claude.calls.some((c) => c[0] === 'plugin' && c[1] === 'marketplace'),
      false,
      'must not run plugin marketplace add without allow_hooks',
    );
    assert.ok(
      result.messages.some((m) => m.startsWith('Superpowers: ✗ claude_code: missing')),
      `missing missing-state message: ${result.messages.join(' | ')}`,
    );
  });

  it('skips the Superpowers step entirely when the integration is disabled', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const rtk = fakeRtkInit();
    const claude = fakeClaudeCli();

    const result = await applyConfiguration(CONFIG, base, {
      skipMiseInstall: true,
      rtkInit: rtk.fn,
      superpowersDeps: { runClaudeCli: claude.fn },
    });
    assert.equal(result.success, true, result.errors.join('; '));
    assert.equal(claude.calls.length, 0, 'claude must not be invoked when integration is disabled');
  });

  it('omits the prerequisite line when skipPrereqMessage is set', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    const rtk = fakeRtkInit();
    const result = await applyConfiguration(CONFIG, base, {
      skipMiseInstall: true,
      skipPrereqMessage: true,
      rtkInit: rtk.fn,
    });
    assert.equal(result.success, true, result.errors.join('; '));
    assert.equal(result.messages.filter((m) => m.startsWith('Prerequisite: mise')).length, 0);
  });
});
