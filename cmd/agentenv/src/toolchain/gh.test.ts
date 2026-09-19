import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { classifyGhAuthStatus, resolveGhAuthProbe } from './gh.js';
import type { GhAuthProbeFn } from './gh.js';

describe('gh auth status probe', () => {
  it('uses an injected probe instead of the real gh binary', () => {
    const stub: GhAuthProbeFn = () => ({ status: 'authenticated' });
    assert.deepEqual(resolveGhAuthProbe(stub)(), { status: 'authenticated' });
  });

  it('defaults to the real probe when none is injected, and it never throws', () => {
    const probe = resolveGhAuthProbe();
    const result = probe();
    assert.ok(
      ['authenticated', 'unauthenticated', 'unknown', 'not_installed'].includes(result.status),
    );
  });

  it('classifies each spawnSync outcome without ever surfacing captured output', () => {
    // Exercised indirectly: the module never exports a function that returns
    // stdout/stderr, only the classified `status` field.
    const probe = resolveGhAuthProbe();
    const result = probe();
    assert.equal(Object.keys(result).length, 1);
    assert.ok('status' in result);
  });

  it('never constructs a forbidden gh auth subcommand (login/token/setup-git)', () => {
    // Reads the TS source directly (not the compiled dist/ output this test
    // itself runs from) so the safeguard survives however the build works.
    const source = fs.readFileSync(new URL('../../src/toolchain/gh.ts', import.meta.url), 'utf-8');
    assert.ok(!/auth['"\s]+,?\s*['"]login/.test(source), 'source must never build `gh auth login`');
    assert.ok(!/auth['"\s]+,?\s*['"]token/.test(source), 'source must never build `gh auth token`');
    assert.ok(
      !/auth['"\s]+,?\s*['"]setup-git/.test(source),
      'source must never build `gh auth setup-git`',
    );
    assert.match(source, /'auth', 'status', '--hostname', 'github\.com'/);
  });

  it('classifies exit 1 as unauthenticated unless stderr smells like a network failure', () => {
    assert.equal(classifyGhAuthStatus(0, ''), 'authenticated');
    assert.equal(classifyGhAuthStatus(1, 'not logged in. run: gh auth login'), 'unauthenticated');
    assert.equal(
      classifyGhAuthStatus(1, 'failed to connect to github.com: connection refused'),
      'unknown',
    );
    assert.equal(classifyGhAuthStatus(1, 'SSL error / tls handshake timeout'), 'unknown');
    assert.equal(classifyGhAuthStatus(2, 'some other failure'), 'unknown');
    assert.equal(classifyGhAuthStatus(null, ''), 'unknown');
  });
});
