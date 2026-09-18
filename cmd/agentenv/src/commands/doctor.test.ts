import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoctor } from './doctor.js';
import type { DoctorSection } from './doctor.js';
import { LOGO } from '../ui/output.js';

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
    assert.ok(output.includes(LOGO));
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

import { doctorToJson } from './doctor.js';

describe('doctorToJson', () => {
  const sections: DoctorSection[] = [
    { title: 'System', items: [{ status: 'ok', label: 'OS', detail: 'linux' }] },
    { title: 'Tools', items: [{ status: 'warn', label: 'rg', detail: 'not on PATH' }] },
  ];

  it('reports ok / exit 0 when no item fails', () => {
    const json = doctorToJson(sections);
    assert.equal(json.command, 'doctor');
    assert.equal(json.status, 'ok');
    assert.equal(json.exitCode, 0);
    assert.deepEqual(json.sections, sections);
  });

  it('reports fail / exit 1 when any item fails', () => {
    const json = doctorToJson([
      { title: 'X', items: [{ status: 'fail', label: 'shims_dir', detail: 'unset' }] },
    ]);
    assert.equal(json.status, 'fail');
    assert.equal(json.exitCode, 1);
  });

  it('omits the heading when includeHeading is false', () => {
    assert.ok(!renderDoctor(sections, { includeHeading: false }).includes(LOGO));
    assert.ok(renderDoctor(sections).includes(LOGO));
  });
});
