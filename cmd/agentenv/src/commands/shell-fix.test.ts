import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderShellFixRevert, renderShellFixShow, type ShellFixShowJson } from './shell-fix.js';

const base: ShellFixShowJson = {
  command: 'shell-fix',
  statePath: '/home/u/.config/agentenv/shell-fix-state.json',
  bashExe: 'C:\\Git\\bash.exe',
  recorded: [],
  current: [
    { agent: 'claude_code', configured: false, shell: null },
    { agent: 'codex_cli', configured: true, shell: 'C:\\Git\\bash.exe' },
    { agent: 'opencode', configured: false, shell: null },
  ],
  exitCode: 0,
};

describe('shell-fix rendering', () => {
  it('renders an empty manifest and the current configuration', () => {
    const out = renderShellFixShow(base);
    assert.match(out, /Recorded changes: none/);
    assert.match(out, /codex_cli: configured \(C:\\Git\\bash\.exe\)/);
    assert.match(out, /claude_code: not configured/);
  });

  it('renders recorded fields with the prior value or (unset)', () => {
    const out = renderShellFixShow({
      ...base,
      recorded: [
        {
          agent: 'claude_code',
          file: 'C:\\h\\.claude\\settings.json',
          createdFile: true,
          fields: [
            { key: 'env.CLAUDE_CODE_GIT_BASH_PATH', previous: null },
            { key: 'shell', previous: '/bin/sh' },
          ],
        },
      ],
    });
    assert.match(out, /Recorded changes \(1\)/);
    assert.match(out, /created by agentenv/);
    assert.match(out, /env\.CLAUDE_CODE_GIT_BASH_PATH: \(unset\) → C:\\Git\\bash\.exe/);
    assert.match(out, /shell: \/bin\/sh → C:\\Git\\bash\.exe/);
  });

  it('renders revert results, prefixing dry-run previews', () => {
    const results = [
      {
        agent: 'claude_code' as const,
        file: 'a',
        action: 'removed' as const,
        message: 'Removed a',
      },
      { agent: 'codex_cli' as const, file: 'b', action: 'skipped' as const, message: 'skipped b' },
    ];
    assert.match(renderShellFixRevert(results, false)[0], /claude_code: Removed a/);
    assert.match(renderShellFixRevert(results, true)[0], /claude_code: \(dry run\) Removed a/);
  });

  it('renders a friendly line when there is nothing to revert', () => {
    assert.deepEqual(renderShellFixRevert([], false), [
      'No recorded Tier 0 shell changes to revert.',
    ]);
  });
});
