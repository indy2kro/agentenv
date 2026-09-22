import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoctor, filterDoctorSections, wantsDoctorSection } from './doctor.js';
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

describe('filterDoctorSections', () => {
  const sections: DoctorSection[] = [
    { title: 'System', items: [{ status: 'ok', label: 'OS', detail: 'win32' }] },
    { title: 'Mise', items: [{ status: 'ok', label: 'mise', detail: 'x' }] },
    { title: 'Tools', items: [{ status: 'fail', label: 'rg', detail: 'missing' }] },
  ];

  it('selects by 1-based index', () => {
    const one = filterDoctorSections(sections, '1');
    assert.equal(one?.length, 1);
    assert.equal(one?.[0].title, 'System');
    assert.equal(filterDoctorSections(sections, '3')?.[0].title, 'Tools');
  });

  it('selects by case-insensitive title prefix', () => {
    assert.equal(filterDoctorSections(sections, 'tool')?.[0].title, 'Tools');
    assert.equal(filterDoctorSections(sections, 'TOOLS')?.[0].title, 'Tools');
  });

  it('returns undefined for an out-of-range index or unmatched prefix', () => {
    assert.equal(filterDoctorSections(sections, '9'), undefined);
    assert.equal(filterDoctorSections(sections, 'agents'), undefined);
  });
});

describe('wantsDoctorSection', () => {
  it('wants every section when there is no filter', () => {
    assert.equal(wantsDoctorSection(undefined, 'Tools'), true);
    assert.equal(wantsDoctorSection(undefined, 'RTK'), true);
  });

  it('wants every section for a numeric (index-based) filter — cannot be resolved cheaply', () => {
    assert.equal(wantsDoctorSection('3', 'Tools'), true);
    assert.equal(wantsDoctorSection('3', 'Agents'), true);
  });

  it('only wants the section matching a name-based filter (case-insensitive prefix)', () => {
    assert.equal(wantsDoctorSection('rtk', 'RTK'), true);
    assert.equal(wantsDoctorSection('RTK', 'RTK'), true);
    assert.equal(wantsDoctorSection('rtk', 'Tools'), false);
    assert.equal(wantsDoctorSection('rtk', 'Agents'), false);
  });
});
