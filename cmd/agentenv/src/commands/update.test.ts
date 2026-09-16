import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { verifySummaryLine, toolAvailabilityLine, miseActivationHint } from '../toolchain/mise.js';
import type { ToolAvailability } from '../toolchain/mise.js';

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
