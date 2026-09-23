import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { verifySummaryLine, toolAvailabilityLine, miseActivationHint } from '../toolchain/mise.js';
import type { ToolAvailability } from '../toolchain/mise.js';
import { watchMiseToml } from './update.js';

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
