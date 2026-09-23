import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_CONFIG, type AgentenvConfig } from '../config/schema.js';
import {
  buildUnwirePlan,
  calculateUninstallTargets,
  executeUnwire,
  parseAgentList,
  resolveToolArgs,
  uninstallPlan,
  renderUninstallSummary,
} from './uninstall.js';
import type { UninstallPlan } from './uninstall.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const start = '<!-- agentenv-managed-start -->';
const end = '<!-- agentenv-managed-end -->';

const config = (tools: Record<string, boolean>, customTools: unknown[] = []): AgentenvConfig =>
  ({ tools, custom_tools: customTools }) as AgentenvConfig;

describe('calculateUninstallTargets', () => {
  it('includes enabled non-fallback tools and maps binary via BINARY_MAP', () => {
    const targets = calculateUninstallTargets(config({ ripgrep: true, fd: true }));
    assert.deepEqual(targets, [
      { key: 'ripgrep', miseName: 'ripgrep', binary: 'rg' },
      { key: 'fd', miseName: 'fd', binary: 'fd' },
    ]);
  });

  it('excludes fallback-required tools even when enabled', () => {
    const targets = calculateUninstallTargets(config({ tokei: true }));
    assert.deepEqual(targets, []);
  });

  it('includes custom tools with a mise_source and dedupes by miseName', () => {
    const targets = calculateUninstallTargets(
      config({ uv: true }, [
        { name: 'pymgr', description: 'x', mise_source: 'uv' },
        { name: 'manual', description: 'x', already_installed: true, path_linux: '/usr/bin/foo' },
      ]),
    );
    // uv appears once (the catalog tool wins; the custom duplicate is dropped),
    // and the manual custom tool without mise_source is excluded.
    assert.deepEqual(targets, [{ key: 'uv', miseName: 'uv', binary: 'uv' }]);
  });
});

describe('resolveToolArgs', () => {
  const targets = [
    { key: 'ripgrep', miseName: 'ripgrep', binary: 'rg' },
    { key: 'git_delta', miseName: 'delta', binary: 'delta' },
    { key: 'ast_grep', miseName: 'ast-grep', binary: 'sg' },
  ];

  it('resolves key, binary, and miseName forms', () => {
    const result = resolveToolArgs(['ripgrep', 'delta', 'ast-grep'], targets);
    assert.equal(result.matched.length, 3);
    assert.deepEqual(
      result.matched.map((t) => t.key),
      ['ripgrep', 'git_delta', 'ast_grep'],
    );
    assert.deepEqual(result.unknown, []);
  });

  it('returns unknown for unmatched args (and does not dedupe arbitrary dupes)', () => {
    const result = resolveToolArgs(['rg', 'nope', 'rg'], targets);
    assert.deepEqual(result.unknown, ['nope']);
    assert.deepEqual(result.matched, [{ key: 'ripgrep', miseName: 'ripgrep', binary: 'rg' }]);
  });

  it('returns no matches for empty args (all-targets fallback lives in doUninstall)', () => {
    assert.deepEqual(resolveToolArgs([], targets), { matched: [], unknown: [] });
  });

  it('dedupes a target matched by multiple arg forms', () => {
    const result = resolveToolArgs(['rg', 'ripgrep'], targets);
    assert.deepEqual(result.unknown, []);
    assert.deepEqual(result.matched, [{ key: 'ripgrep', miseName: 'ripgrep', binary: 'rg' }]);
  });
});

describe('uninstallPlan', () => {
  it('splits targets into toUninstall (installed) and alreadyGone', () => {
    const plan = uninstallPlan([{ key: 'ripgrep', miseName: 'ripgrep', binary: 'rg' }], {
      ripgrep: { installed: true, versions: ['15.2.0'] },
    });
    assert.deepEqual(plan, { toUninstall: ['ripgrep'], alreadyGone: [] });
  });

  it('treats declared-but-uninstalled and absent tools as already gone', () => {
    const targets = [
      { key: 'fd', miseName: 'fd', binary: 'fd' },
      { key: 'gh', miseName: 'gh', binary: 'gh' },
    ];
    assert.deepEqual(uninstallPlan(targets, { fd: { installed: false, versions: [] } }), {
      toUninstall: [],
      alreadyGone: ['fd', 'gh'],
    });
  });
});

describe('renderUninstallSummary', () => {
  const targets = [
    { key: 'ripgrep', miseName: 'ripgrep', binary: 'rg' },
    { key: 'fd', miseName: 'fd', binary: 'fd' },
  ];
  const plan: UninstallPlan = { toUninstall: ['ripgrep'], alreadyGone: ['fd'] };

  it('renders preview markers', () => {
    const lines = renderUninstallSummary(targets, plan, 'preview', false);
    assert.ok(lines.some((l) => l.includes('rg') && l.includes('would uninstall')));
    assert.ok(lines.some((l) => l.includes('fd') && l.includes('already gone')));
  });

  it('renders result markers', () => {
    const lines = renderUninstallSummary(targets, plan, 'result', false);
    assert.ok(lines.some((l) => l.includes('rg') && l.includes('removed')));
  });

  it('renders every target as state-unknown when mise is absent', () => {
    const lines = renderUninstallSummary(
      targets,
      { toUninstall: [], alreadyGone: [] },
      'preview',
      true,
    );
    assert.equal(lines.length, 2);
    assert.ok(lines.every((l) => l.includes('state unknown')));
  });

  it('renders nothing for an empty plan', () => {
    assert.deepEqual(
      renderUninstallSummary([], { toUninstall: [], alreadyGone: [] }, 'result', false),
      [],
    );
  });
});

describe('parseAgentList (FEAT-03 --unwire-agents)', () => {
  it('parses and dedupes a comma-separated list of valid agent keys', () => {
    const result = parseAgentList('claude_code, codex_cli,claude_code');
    assert.deepEqual(result.agents, ['claude_code', 'codex_cli']);
    assert.deepEqual(result.unknown, []);
  });

  it('collects unknown names instead of throwing', () => {
    const result = parseAgentList('claude_code,not-an-agent');
    assert.deepEqual(result.agents, ['claude_code']);
    assert.deepEqual(result.unknown, ['not-an-agent']);
  });

  it('skips empty entries from stray commas', () => {
    const result = parseAgentList('claude_code,,codex_cli,');
    assert.deepEqual(result.agents, ['claude_code', 'codex_cli']);
    assert.deepEqual(result.unknown, []);
  });
});

describe('buildUnwirePlan (FEAT-03)', () => {
  it('project scope, full unwire: classifies shared AGENTS.md/CLAUDE.md, leaves agentFiles empty', () => {
    const dir = tempDir('agentenv-unwire-plan-');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), `${start}\nold\n${end}\n`);
    // CLAUDE.md left ungenerated on disk -> 'absent'.

    const plan = buildUnwirePlan(DEFAULT_CONFIG, dir, 'project', ['claude_code'], true, false);

    assert.equal(plan.fullUnwire, true);
    assert.deepEqual(plan.agentFiles, []);
    assert.equal(plan.sharedFiles.length, 2);
    const agentsMd = plan.sharedFiles.find((f) => f.path.endsWith('AGENTS.md'));
    const claudeMd = plan.sharedFiles.find((f) => f.path.endsWith('CLAUDE.md'));
    assert.equal(agentsMd?.status, 'delete');
    assert.equal(claudeMd?.status, 'absent');
    assert.equal(plan.miseToml, null);
  });

  it('partial unwire (specific agents given) never touches shared files', () => {
    const dir = tempDir('agentenv-unwire-plan-');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), `${start}\nold\n${end}\n`);

    const plan = buildUnwirePlan(DEFAULT_CONFIG, dir, 'project', ['claude_code'], false, false);

    assert.equal(plan.fullUnwire, false);
    assert.deepEqual(plan.sharedFiles, []);
  });

  it("user scope: classifies each requested agent's own user-instruction file", () => {
    const dir = tempDir('agentenv-unwire-plan-');
    process.env.CLAUDE_CONFIG_DIR = dir;
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), `${start}\nold\n${end}\n`);
      const plan = buildUnwirePlan(DEFAULT_CONFIG, dir, 'user', ['claude_code'], false, false);

      assert.equal(plan.agentFiles.length, 1);
      assert.equal(plan.agentFiles[0].path, path.join(dir, 'CLAUDE.md'));
      assert.equal(plan.agentFiles[0].status, 'delete');
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });

  it('only plans a mise.toml deletion on a full unwire with deleteMiseToml requested', () => {
    const dir = tempDir('agentenv-unwire-plan-');
    fs.writeFileSync(path.join(dir, 'mise.toml'), '# tools\n');

    const notRequested = buildUnwirePlan(
      DEFAULT_CONFIG,
      dir,
      'project',
      ['claude_code'],
      true,
      false,
    );
    assert.equal(notRequested.miseToml, null);

    const partial = buildUnwirePlan(DEFAULT_CONFIG, dir, 'project', ['claude_code'], false, true);
    assert.equal(partial.miseToml, null);

    const full = buildUnwirePlan(DEFAULT_CONFIG, dir, 'project', ['claude_code'], true, true);
    assert.deepEqual(full.miseToml, { path: path.join(dir, 'mise.toml'), exists: true });
  });
});

describe('executeUnwire (FEAT-03)', () => {
  it('runs cleanup() for each targeted agent and reports its message', async () => {
    const dir = tempDir('agentenv-unwire-exec-');
    const plan = buildUnwirePlan(DEFAULT_CONFIG, dir, 'project', ['codex_cli'], false, false);

    const result = await executeUnwire(dir, plan);

    assert.equal(result.success, true);
    assert.ok(result.messages.some((m) => m.includes('Codex CLI')));
  });

  it('strips shared instruction files on a full unwire, leaving other content intact', async () => {
    const dir = tempDir('agentenv-unwire-exec-');
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), `user notes\n\n${start}\nmanaged\n${end}\n`);
    const plan = buildUnwirePlan(DEFAULT_CONFIG, dir, 'project', ['codex_cli'], true, false);

    const result = await executeUnwire(dir, plan);

    assert.equal(result.success, true);
    const content = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.equal(content, 'user notes\n');
  });

  it('deletes mise.toml only when the plan requested it', async () => {
    const dir = tempDir('agentenv-unwire-exec-');
    const miseTomlPath = path.join(dir, 'mise.toml');
    fs.writeFileSync(miseTomlPath, '# tools\n');
    const plan = buildUnwirePlan(DEFAULT_CONFIG, dir, 'project', ['codex_cli'], true, true);

    const result = await executeUnwire(dir, plan);

    assert.equal(result.success, true);
    assert.equal(fs.existsSync(miseTomlPath), false);
    assert.ok(result.messages.some((m) => m.includes('Deleted') && m.includes('mise.toml')));
  });

  it('removes the Claude Code hook via adapter cleanup()', async () => {
    const dir = tempDir('agentenv-unwire-exec-');
    const claudeHome = tempDir('agentenv-unwire-claude-home-');
    process.env.CLAUDE_CONFIG_DIR = claudeHome;
    try {
      const settingsPath = path.join(claudeHome, 'settings.json');
      fs.mkdirSync(claudeHome, { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({
          hooks: {
            PreToolUse: [
              { matcher: 'Bash', hooks: [{ type: 'command', command: 'rtk hook claude' }] },
            ],
          },
        }),
      );
      const plan = buildUnwirePlan(DEFAULT_CONFIG, dir, 'project', ['claude_code'], false, false);

      const result = await executeUnwire(dir, plan);

      assert.equal(result.success, true);
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      assert.equal(settings.hooks.PreToolUse.length, 0);
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });
});
