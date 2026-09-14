import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyConfiguration } from './apply.js';
import type { AgentenvConfig } from '../config/schema.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Snapshot every file under the given roots as content strings keyed by path.
 * Used to prove a second `apply` produces byte-identical output.
 */
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

  it('generates all expected files', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const result = await applyConfiguration(CONFIG, base, { skipMiseInstall: true });
    assert.equal(result.success, true, result.errors.join('; '));

    for (const file of ['mise.toml', 'AGENTS.md', 'CLAUDE.md']) {
      assert.ok(fs.existsSync(path.join(base, file)), `missing ${file}`);
    }
    for (const file of [
      path.join(home, '.claude', 'settings.json'),
      path.join(home, '.codex', 'config.toml'),
      path.join(home, '.codex', 'hooks.json'),
      path.join(home, '.config', 'opencode', 'opencode.json'),
    ]) {
      assert.ok(fs.existsSync(file), `missing ${file}`);
    }
  });

  it('is idempotent: a second apply changes nothing on disk', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const first = await applyConfiguration(CONFIG, base, { skipMiseInstall: true });
    assert.equal(first.success, true, first.errors.join('; '));
    const before = snapshot([base, home]);

    const second = await applyConfiguration(CONFIG, base, { skipMiseInstall: true });
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
  });

  it('preserves user content in codex config.toml and hooks.json across applies', async () => {
    const home = tempDir('agentenv-home-');
    const base = tempDir('agentenv-base-');
    process.env.HOME = home;
    process.env.USERPROFILE = home;

    const codexDir = path.join(home, '.codex');
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(
      path.join(codexDir, 'config.toml'),
      '[model]\nwire_api = true\n\n[features]\nhooks = true\n',
    );
    fs.writeFileSync(
      path.join(codexDir, 'hooks.json'),
      JSON.stringify({ PreToolUse: [{ command: 'my-user-hook', args: ['x'] }] }),
    );

    const first = await applyConfiguration(CONFIG, base, { skipMiseInstall: true });
    assert.equal(first.success, true, first.errors.join('; '));

    const configToml = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf-8');
    assert.match(configToml, /\[model\]/);
    assert.match(configToml, /wire_api = true/);

    const hooks = JSON.parse(fs.readFileSync(path.join(codexDir, 'hooks.json'), 'utf-8'));
    assert.deepEqual(hooks.PreToolUse.filter((h: any) => h.command === 'my-user-hook').length, 1);
    assert.equal(
      hooks.PreToolUse.filter((h: any) => h.command === 'rtk' && h.args?.[0] === 'rewrite').length,
      1,
    );
  });
});
