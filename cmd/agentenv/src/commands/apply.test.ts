import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  applyConfiguration,
  buildApplyDryRunPlan,
  buildApplyJsonResult,
  resolveTier0WriteFiles,
  shouldRunMiseInstall,
  userScopeInstructionFiles,
} from './apply.js';
import type { AgentenvConfig } from '../config/schema.js';
import { DEFAULT_CONFIG } from '../config/schema.js';
import type { GeneratedFile } from '../generate/agentsmd.js';
import type { ClaudeCliRunner } from '../integrations/superpowers.js';
import type { RtkInitFn } from '../toolchain/rtk.js';
import { generateMiseToml } from '../toolchain/mise.js';
import { successGlyph, failGlyph } from '../ui/theme.js';

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
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  // opencodeConfigDir()/copilotConfigDir() prefer XDG_CONFIG_HOME over
  // <HOME>/.config when it's set — a value already present in the ambient
  // environment (some CI images set it) would silently redirect every test
  // below that sets HOME to a temp dir to the real XDG_CONFIG_HOME instead,
  // so it must be scrubbed for the whole block, not just HOME/USERPROFILE.
  delete process.env.XDG_CONFIG_HOME;

  after(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
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
      result.messages.some((m) =>
        m.startsWith(`Superpowers: ${successGlyph()} claude_code: installed`),
      ),
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
      result.messages.some((m) => m.startsWith(`Superpowers: ${failGlyph()} claude_code: missing`)),
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

  describe('user-scope instruction files', () => {
    const USER_CONFIG: AgentenvConfig = {
      ...CONFIG,
      scope: 'user',
    };

    it('writes agentenv-managed instructions into each enabled agent user-level file', async () => {
      const home = tempDir('agentenv-home-');
      const base = tempDir('agentenv-base-');
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      const rtk = fakeRtkInit();

      const result = await applyConfiguration(USER_CONFIG, base, {
        skipMiseInstall: true,
        rtkInit: rtk.fn,
      });
      assert.equal(result.success, true, result.errors.join('; '));

      // Global copies remain in the scope dir for reference/status.
      assert.ok(fs.existsSync(path.join(base, 'AGENTS.md')), 'missing baseDir AGENTS.md');
      assert.ok(fs.existsSync(path.join(base, 'CLAUDE.md')), 'missing baseDir CLAUDE.md');

      // Each enabled agent must get instructions where it actually reads them.
      const expected = [
        path.join(home, '.claude', 'CLAUDE.md'),
        path.join(home, '.codex', 'AGENTS.md'),
        path.join(home, '.copilot', 'copilot-instructions.md'),
        path.join(home, '.config', 'opencode', 'AGENTS.md'),
      ];
      for (const file of expected) {
        assert.ok(fs.existsSync(file), `missing ${file}`);
        const content = fs.readFileSync(file, 'utf-8');
        assert.ok(content.includes('agentenv-managed-start'), `${file} missing start marker`);
        assert.ok(content.includes('Available Tools'), `${file} missing tool instructions`);
      }
    });

    it('creates the agent config dirs before writing user-level instructions', async () => {
      const home = tempDir('agentenv-home-');
      const base = tempDir('agentenv-base-');
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      const rtk = fakeRtkInit();

      const result = await applyConfiguration(USER_CONFIG, base, {
        skipMiseInstall: true,
        rtkInit: rtk.fn,
      });
      assert.equal(result.success, true, result.errors.join('; '));

      assert.equal(fs.existsSync(path.join(home, '.claude')), true);
      assert.equal(fs.existsSync(path.join(home, '.codex')), true);
      assert.equal(fs.existsSync(path.join(home, '.copilot')), true);
      assert.equal(fs.existsSync(path.join(home, '.config', 'opencode')), true);
    });

    it('preserves existing user instructions outside the managed markers', async () => {
      const home = tempDir('agentenv-home-');
      const base = tempDir('agentenv-base-');
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      const rtk = fakeRtkInit();

      const claudeMd = path.join(home, '.claude', 'CLAUDE.md');
      fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
      fs.writeFileSync(claudeMd, '# My personal Claude hints\n\nAlways use delta for diffs.\n');

      const result = await applyConfiguration(USER_CONFIG, base, {
        skipMiseInstall: true,
        rtkInit: rtk.fn,
      });
      assert.equal(result.success, true, result.errors.join('; '));

      const content = fs.readFileSync(claudeMd, 'utf-8');
      assert.ok(
        content.includes('# My personal Claude hints'),
        'user content was lost:\n' + content,
      );
      assert.ok(content.includes('Always use delta for diffs.'), 'user content was lost');
      assert.ok(content.includes('agentenv-managed-start'), 'managed block missing');
    });

    it('returns no extra files when scope is project', () => {
      const base = tempDir('agentenv-base-');
      const files = userScopeInstructionFiles(CONFIG, base, {});
      assert.deepEqual(files, []);
    });
  });
});

describe('resolveTier0WriteFiles', () => {
  it('"auto" only writes with a TTY', () => {
    assert.equal(resolveTier0WriteFiles('auto', true), true);
    assert.equal(resolveTier0WriteFiles('auto', false), false);
  });

  it('"always" writes regardless of TTY — this is what lets an agent (no TTY) get the fix', () => {
    assert.equal(resolveTier0WriteFiles('always', false), true);
    assert.equal(resolveTier0WriteFiles('always', true), true);
  });

  it('"never" never writes, even with a TTY', () => {
    assert.equal(resolveTier0WriteFiles('never', true), false);
    assert.equal(resolveTier0WriteFiles('never', false), false);
  });
});

describe('shouldRunMiseInstall', () => {
  it('runs once mise.toml was written, regardless of unrelated earlier errors (e.g. Tier 0)', () => {
    // The old logic gated this on `errors.length === 0`, so a Tier 0 failure
    // (pushed to `errors` before mise.toml is even written) used to skip
    // installing every configured tool. shouldRunMiseInstall only takes
    // whether mise.toml itself was written — it has no way to see the
    // unrelated error count at all, which is exactly the fix.
    assert.equal(shouldRunMiseInstall(true, false), true);
  });

  it('does not run when mise.toml itself failed to write (nothing to install)', () => {
    assert.equal(shouldRunMiseInstall(false, false), false);
  });

  it('does not run when --skip-mise-install was passed', () => {
    assert.equal(shouldRunMiseInstall(true, true), false);
  });
});

describe('buildApplyJsonResult', () => {
  it('carries success/messages/errors/elapsedMs through, plus configPath/baseDir/warnings', () => {
    const json = buildApplyJsonResult(
      { success: true, messages: ['a', 'b'], errors: [], elapsedMs: 42 },
      { configPath: '/proj/agentenv.toml', baseDir: '/proj', warnings: ['careful'] },
    );
    assert.deepEqual(json, {
      success: true,
      configPath: '/proj/agentenv.toml',
      baseDir: '/proj',
      messages: ['a', 'b'],
      errors: [],
      warnings: ['careful'],
      elapsedMs: 42,
    });
  });

  it('reflects a failed apply', () => {
    const json = buildApplyJsonResult(
      { success: false, messages: [], errors: ['boom'] },
      { configPath: '/proj/agentenv.toml', baseDir: '/proj', warnings: [] },
    );
    assert.equal(json.success, false);
    assert.deepEqual(json.errors, ['boom']);
  });
});

describe('buildApplyDryRunPlan', () => {
  it('reports mise.toml as create when the file does not exist yet', () => {
    const dir = tempDir('agentenv-dryrun-mise-');
    const plan = buildApplyDryRunPlan(
      DEFAULT_CONFIG,
      dir,
      path.join(dir, 'agentenv.toml'),
      [],
      ['claude_code'],
      [],
    );
    assert.equal(plan.misePlan.status, 'create');
    assert.equal(plan.misePlan.miseTomlPath, path.join(dir, 'mise.toml'));
    assert.ok(plan.misePlan.enabledToolCount > 0);
  });

  it('reports mise.toml as unchanged when its content already matches, update when it differs', () => {
    const dir = tempDir('agentenv-dryrun-mise-');
    const miseTomlPath = path.join(dir, 'mise.toml');

    fs.writeFileSync(miseTomlPath, 'stale content\n');
    const stale = buildApplyDryRunPlan(
      DEFAULT_CONFIG,
      dir,
      path.join(dir, 'agentenv.toml'),
      [],
      ['claude_code'],
      [],
    );
    assert.equal(stale.misePlan.status, 'update');

    // Write the exact content generateMiseToml() would produce for this
    // config, so the assertion never depends on hand-maintained TOML syntax.
    fs.writeFileSync(
      miseTomlPath,
      generateMiseToml(DEFAULT_CONFIG, DEFAULT_CONFIG.custom_tools ?? []),
    );
    const matching = buildApplyDryRunPlan(
      DEFAULT_CONFIG,
      dir,
      path.join(dir, 'agentenv.toml'),
      [],
      ['claude_code'],
      [],
    );
    assert.equal(matching.misePlan.status, 'unchanged');
  });

  it('classifies generated files via planMarkerUpdate: create, update, unchanged', () => {
    const dir = tempDir('agentenv-dryrun-files-');
    const markerStart = '<!-- agentenv-managed-start -->';
    const markerEnd = '<!-- agentenv-managed-end -->';

    const createPath = path.join(dir, 'NEW.md');
    const updatePath = path.join(dir, 'STALE.md');
    fs.writeFileSync(updatePath, `intro\n${markerStart}\nold body\n${markerEnd}\noutro\n`);
    const unchangedPath = path.join(dir, 'SAME.md');
    const unchangedBody = `${markerStart}\ncurrent body\n${markerEnd}\n`;
    fs.writeFileSync(unchangedPath, unchangedBody);

    const files: GeneratedFile[] = [
      { path: createPath, content: `${markerStart}\nnew body\n${markerEnd}\n` },
      { path: updatePath, content: `intro\n${markerStart}\nnew body\n${markerEnd}\noutro\n` },
      { path: unchangedPath, content: unchangedBody },
    ];

    const plan = buildApplyDryRunPlan(
      DEFAULT_CONFIG,
      dir,
      path.join(dir, 'agentenv.toml'),
      files,
      ['claude_code'],
      [],
    );

    assert.deepEqual(
      plan.generatedFiles.map((f) => ({ path: f.path, status: f.status })),
      [
        { path: createPath, status: 'create' },
        { path: updatePath, status: 'update' },
        { path: unchangedPath, status: 'unchanged' },
      ],
    );
  });

  it('reports error status for a file with only one managed marker present', () => {
    const dir = tempDir('agentenv-dryrun-partial-');
    const markerStart = '<!-- agentenv-managed-start -->';
    const markerEnd = '<!-- agentenv-managed-end -->';
    const partialPath = path.join(dir, 'PARTIAL.md');
    fs.writeFileSync(partialPath, `intro\n${markerStart}\nonly start\n`);

    const plan = buildApplyDryRunPlan(
      DEFAULT_CONFIG,
      dir,
      path.join(dir, 'agentenv.toml'),
      [{ path: partialPath, content: `${markerStart}\nbody\n${markerEnd}\n` }],
      ['claude_code'],
      [],
    );

    assert.equal(plan.generatedFiles.length, 1);
    assert.equal(plan.generatedFiles[0].status, 'error');
    assert.match(plan.generatedFiles[0].message ?? '', /partial write/);
  });

  it('carries through agents, rtkEnabled, and integration names', () => {
    const dir = tempDir('agentenv-dryrun-meta-');
    const config: AgentenvConfig = {
      ...DEFAULT_CONFIG,
      rtk: { ...DEFAULT_CONFIG.rtk, enabled: true },
    };
    const plan = buildApplyDryRunPlan(
      config,
      dir,
      path.join(dir, 'agentenv.toml'),
      [],
      ['claude_code', 'codex_cli'],
      [{ getName: () => 'superpowers' }],
    );

    assert.deepEqual(plan.agents, ['claude_code', 'codex_cli']);
    assert.equal(plan.rtkEnabled, true);
    assert.deepEqual(plan.integrations, ['superpowers']);
  });

  it('leaves tier0 null off Windows', { skip: process.platform === 'win32' }, () => {
    const dir = tempDir('agentenv-dryrun-tier0-');
    const plan = buildApplyDryRunPlan(
      DEFAULT_CONFIG,
      dir,
      path.join(dir, 'agentenv.toml'),
      [],
      ['claude_code'],
      [],
    );
    assert.equal(plan.tier0, null);
  });

  it(
    'populates a per-agent tier0 plan on Windows when Git Bash is found',
    { skip: process.platform !== 'win32' },
    () => {
      const dir = tempDir('agentenv-dryrun-tier0-');
      const plan = buildApplyDryRunPlan(
        DEFAULT_CONFIG,
        dir,
        path.join(dir, 'agentenv.toml'),
        [],
        ['claude_code', 'codex_cli'],
        [],
      );
      // Whether Git Bash is actually found is a real machine fact; either shape
      // (null, or one entry per requested agent) is valid — assert internal
      // consistency rather than the specific outcome.
      if (plan.tier0 !== null) {
        assert.deepEqual(
          plan.tier0.map((t) => t.agent),
          ['claude_code', 'codex_cli'],
        );
        for (const entry of plan.tier0) {
          assert.equal(typeof entry.needsFix, 'boolean');
        }
      }
    },
  );
});
