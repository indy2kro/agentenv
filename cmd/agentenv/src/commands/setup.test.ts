import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { misePrereqCheck, unattendedSetup } from './setup.js';
import { applyConfiguration } from './apply.js';
import { DEFAULT_CONFIG, saveConfig } from '../config/schema.js';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// The step 0 prerequisite must be printed exactly once across the
// setup -> apply pipeline: setup prints it and tells apply not to repeat it.
// (Plan Task 2: prereq check deduplication.)

describe('setup prerequisite check', () => {
  it('prints the one "Prerequisite: mise" line when mise is installed', () => {
    const logs: string[] = [];
    const original = console.log;
    console.log = (message?: unknown) => logs.push(String(message));
    try {
      const ok = misePrereqCheck({ isInstalled: () => true, version: () => '3.2.1' });
      assert.equal(ok, true);
      const prereq = logs.filter((line) => line.startsWith('Prerequisite: mise'));
      assert.equal(prereq.length, 1);
      assert.match(prereq[0], /Prerequisite: mise 3\.2\.1/);
    } finally {
      console.log = original;
    }
  });

  it('fails loudly with install instructions when mise is missing', () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (message?: unknown) => errors.push(String(message));
    try {
      const ok = misePrereqCheck({ isInstalled: () => false });
      assert.equal(ok, false);
      assert.ok(errors.some((line) => /install mise/i.test(line)));
    } finally {
      console.error = original;
    }
  });
});

describe('unattended setup pipeline', () => {
  it('emits exactly one prerequisite line and suppresses the apply duplicate', async () => {
    const dir = tempDir('agentenv-setup-');
    const toml = path.join(dir, 'agentenv.toml');
    saveConfig(DEFAULT_CONFIG, toml);

    let seenOptions: { skipPrereqMessage?: boolean } | undefined;
    const stubApply: typeof applyConfiguration = async (_config, _baseDir, options = {}) => {
      seenOptions = options;
      return { success: true, messages: [], errors: [] };
    };

    const logs: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalCwd = process.cwd();
    console.log = (message?: unknown) => logs.push(String(message));
    console.error = () => {};
    try {
      process.chdir(dir);
      await unattendedSetup(
        { config: toml, yes: true },
        {
          misePrereqCheckDeps: { isInstalled: () => true, version: () => '3.2.1' },
          applyConfiguration: stubApply,
        },
      );
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
      console.error = originalError;
    }

    assert.equal(seenOptions?.skipPrereqMessage, true);
    assert.equal(logs.filter((line) => line.startsWith('Prerequisite: mise')).length, 1);
  });
});
