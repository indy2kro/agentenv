import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoctor } from './doctor.js';
import type { DoctorSection } from './doctor.js';

describe('doctor renderer', () => {
  it('renders ok/warn/fail glyphs and sections in order', () => {
    const sections: DoctorSection[] = [
      {
        title: 'System',
        items: [{ status: 'ok', label: 'Shell', detail: 'PowerShell' }],
      },
      {
        title: 'Mise',
        items: [
          { status: 'ok', label: 'mise', detail: '2026.9.5' },
          { status: 'fail', label: 'shims_dir', detail: 'not set — run `agentenv apply`' },
        ],
      },
      {
        title: 'Tools',
        items: [{ status: 'warn', label: 'rg (ripgrep)', detail: 'not on PATH' }],
      },
    ];

    const output = renderDoctor(sections);
    assert.match(output, /=== agentenv Doctor ===/);
    assert.match(output, /\[ok\] {3}Shell — PowerShell/);
    assert.match(output, /\[fail\] shims_dir — not set — run `agentenv apply`/);
    assert.match(output, /\[warn\] rg \(ripgrep\) — not on PATH/);
    assert.ok(output.indexOf('System') < output.indexOf('Mise'));
    assert.ok(output.indexOf('Mise') < output.indexOf('Tools'));
  });

  it('omits the trailing dash when detail is empty', () => {
    const output = renderDoctor([
      { title: 'X', items: [{ status: 'ok', label: 'plain', detail: '' }] },
    ]);
    assert.match(output, /\[ok\] {3}plain\n/);
  });
});
