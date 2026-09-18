import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentenvConfig } from '../config/schema.js';
import {
  calculateUninstallTargets,
  resolveToolArgs,
  uninstallPlan,
  renderUninstallSummary,
} from './uninstall.js';
import type { UninstallPlan } from './uninstall.js';

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

  it('matches all targets when given no args (all-targets fallback lives in doUninstall)', () => {
    assert.deepEqual(resolveToolArgs([], targets), { matched: [], unknown: [] });
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
