import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  applyAgentShellFix,
  bashExecutable,
  checkAgentShellConfiguration,
  checkGNUCoreutils,
  checkMissingUtilities,
  detectShell,
  findGitBashOnPath,
  fixShellConfiguration,
  gitBashCandidatePaths,
  removeTomlWindowsShellPath,
  revertShellFixes,
  type ShellFixResult,
} from './detector.js';
import {
  mergeShellFixEntries,
  readShellFixState,
  writeShellFixState,
  type ShellFixStateEntry,
} from './shell-fix-state.js';

const bashExe = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe';

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-tier0s-'));
}

function tempStatePath(): string {
  return path.join(tempHome(), 'state', 'shell-fix-state.json');
}

/** Persist the revert records from apply results, as fixShellConfiguration does. */
function persist(results: ShellFixResult[], bashExeValue: string, statePath: string): void {
  const entries = results
    .map((result) => result.state)
    .filter((entry): entry is ShellFixStateEntry => entry !== undefined);
  writeShellFixState(mergeShellFixEntries(null, entries, bashExeValue), statePath);
}

describe('Tier 0 shell fix', () => {
  it('resolves bash.exe from both Git Bash directory forms', () => {
    assert.equal(bashExecutable('C:\\Program Files\\Git\\usr\\bin'), bashExe);
    assert.equal(bashExecutable('C:\\Program Files\\Git\\bin'), bashExe);
  });

  describe('Claude Code', () => {
    it('creates settings.json with the Git Bash env override', () => {
      const home = tempHome();
      const result = applyAgentShellFix('claude_code', bashExe, home);
      const settings = JSON.parse(
        fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'),
      );

      assert.equal(result.action, 'created');
      assert.equal(settings.env.CLAUDE_CODE_GIT_BASH_PATH, bashExe);
    });

    it('preserves existing user settings and is idempotent', () => {
      const home = tempHome();
      const file = path.join(home, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({
          env: { SOME_USER_VAR: 'x' },
          permissions: { allow: ['Bash(claude:*)'] },
        }),
      );

      applyAgentShellFix('claude_code', bashExe, home);
      const once: Record<string, any> = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(once.env.CLAUDE_CODE_GIT_BASH_PATH, bashExe);
      assert.equal(once.env.SOME_USER_VAR, 'x');
      assert.deepEqual(once.permissions, { allow: ['Bash(claude:*)'] });

      const second = applyAgentShellFix('claude_code', bashExe, home);
      assert.equal(second.action, 'unchanged');
    });

    it('skips unparseable user settings instead of clobbering them', () => {
      const home = tempHome();
      const file = path.join(home, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '{"broken":');

      const result = applyAgentShellFix('claude_code', bashExe, home);
      assert.equal(result.action, 'skipped');
      assert.equal(fs.readFileSync(file, 'utf8'), '{"broken":');
    });
  });

  describe('Codex CLI', () => {
    it('creates config.toml with the [windows] shell_path', () => {
      const home = tempHome();
      const result = applyAgentShellFix('codex_cli', bashExe, home);
      const content = fs.readFileSync(path.join(home, '.codex', 'config.toml'), 'utf8');

      assert.equal(result.action, 'created');
      assert.match(content, /\[windows\]/);
      assert.match(content, /shell_path = "C:\\\\Program Files\\\\Git\\\\usr\\\\bin\\\\bash\.exe"/);
    });

    it('preserves existing config sections and is idempotent', () => {
      const home = tempHome();
      const file = path.join(home, '.codex', 'config.toml');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '[model]\nwire_api = true\n\n[features]\nhooks = true\n');

      applyAgentShellFix('codex_cli', bashExe, home);
      const content = fs.readFileSync(file, 'utf8');
      assert.match(content, /\[model\]/);
      assert.match(content, /wire_api = true/);
      assert.match(content, /\[features\]/);
      assert.match(content, /\[windows\]/);

      const second = applyAgentShellFix('codex_cli', bashExe, home);
      assert.equal(second.action, 'unchanged');
    });
  });

  describe('OpenCode', () => {
    it('creates opencode.json with shell and defaultShell', () => {
      const home = tempHome();
      const result = applyAgentShellFix('opencode', bashExe, home);
      const config = JSON.parse(
        fs.readFileSync(path.join(home, '.config', 'opencode', 'opencode.json'), 'utf8'),
      );

      assert.equal(result.action, 'created');
      assert.equal(config.shell, bashExe);
      assert.equal(config.defaultShell, bashExe);
    });

    it('preserves existing config keys and is idempotent', () => {
      const home = tempHome();
      const file = path.join(home, '.config', 'opencode', 'opencode.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ theme: 'dark', plugins: [] }));

      applyAgentShellFix('opencode', bashExe, home);
      const config: Record<string, any> = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(config.shell, bashExe);
      assert.equal(config.theme, 'dark');

      const second = applyAgentShellFix('opencode', bashExe, home);
      assert.equal(second.action, 'unchanged');
    });
  });

  describe('GitHub Copilot', () => {
    it('is skipped (no per-file override mechanism)', () => {
      const home = tempHome();
      const result = applyAgentShellFix('copilot', bashExe, home);
      assert.equal(result.action, 'skipped');
      assert.equal(result.file, '');
    });
  });

  describe('checkAgentShellConfiguration', () => {
    it('claude_code: not configured when settings.json is absent', () => {
      const result = checkAgentShellConfiguration('claude_code', tempHome());
      assert.equal(result.isConfigured, false);
      assert.equal(result.needsFix, true);
    });

    it('claude_code: configured with no fix needed after applyAgentShellFix', () => {
      const home = tempHome();
      applyAgentShellFix('claude_code', bashExe, home);
      const result = checkAgentShellConfiguration('claude_code', home);
      assert.equal(result.isConfigured, true);
      assert.equal(result.needsFix, false);
      assert.equal(result.shell, bashExe);
    });

    it('codex_cli: not configured when config.toml is absent', () => {
      const result = checkAgentShellConfiguration('codex_cli', tempHome());
      assert.equal(result.isConfigured, false);
      assert.equal(result.needsFix, true);
    });

    it('codex_cli: configured with no fix needed after applyAgentShellFix', () => {
      const home = tempHome();
      applyAgentShellFix('codex_cli', bashExe, home);
      const result = checkAgentShellConfiguration('codex_cli', home);
      assert.equal(result.isConfigured, true);
      assert.equal(result.needsFix, false);
      assert.equal(result.shell, bashExe);
    });

    it('opencode: not configured when opencode.json is absent', () => {
      const result = checkAgentShellConfiguration('opencode', tempHome());
      assert.equal(result.isConfigured, false);
      assert.equal(result.needsFix, true);
    });

    it('opencode: configured with no fix needed after applyAgentShellFix', () => {
      const home = tempHome();
      applyAgentShellFix('opencode', bashExe, home);
      const result = checkAgentShellConfiguration('opencode', home);
      assert.equal(result.isConfigured, true);
      assert.equal(result.needsFix, false);
      assert.equal(result.shell, bashExe);
    });

    it('copilot: always configured with no fix needed (no per-file override exists)', () => {
      const result = checkAgentShellConfiguration('copilot', tempHome());
      assert.equal(result.isConfigured, true);
      assert.equal(result.needsFix, false);
    });

    it('applyAgentShellFix returns skipped for new delegation agents', () => {
      for (const agent of ['gemini_cli', 'cursor', 'windsurf', 'cline', 'vibe'] as const) {
        const result = applyAgentShellFix(agent, bashExe, tempHome());
        assert.equal(result.action, 'skipped');
      }
    });

    it('checkAgentShellConfiguration treats vibe as already configured', () => {
      const result = checkAgentShellConfiguration('vibe', tempHome());
      assert.equal(result.isConfigured, true);
      assert.equal(result.needsFix, false);
    });
  });

  describe('copilot message', () => {
    it('says no change needed and never uses a failure mark', () => {
      const result = applyAgentShellFix('copilot', bashExe, tempHome());
      assert.match(result.message, /no change needed/);
      assert.equal(result.message.includes('✗'), false);
    });
  });

  describe('non-TTY Tier 0', () => {
    it('skips writes when complex is false', () => {
      const result = fixShellConfiguration('.', ['claude_code'], false);
      assert.equal(result.success, true);
      if (process.platform === 'win32') {
        assert.match(result.message, /skipped|POSIX-compatible|Git Bash not found/i);
      }
    });
  });

  describe('revert records and applies', () => {
    it('records prior values for created and updated writes', () => {
      const created = applyAgentShellFix('claude_code', bashExe, tempHome());
      assert.equal(created.state?.createdFile, true);
      assert.equal(created.state?.fields[0].previous, null);

      const home = tempHome();
      const file = path.join(home, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ env: { CLAUDE_CODE_GIT_BASH_PATH: 'old-bash' } }));
      const updated = applyAgentShellFix('claude_code', bashExe, home);
      assert.equal(updated.state?.createdFile, false);
      assert.equal(updated.state?.fields[0].previous, 'old-bash');

      const codexHome = tempHome();
      const codexFile = path.join(codexHome, '.codex', 'config.toml');
      fs.mkdirSync(path.dirname(codexFile), { recursive: true });
      fs.writeFileSync(codexFile, '[windows]\nshell_path = "old-bash"\n');
      const codex = applyAgentShellFix('codex_cli', bashExe, codexHome);
      assert.equal(codex.state?.fields[0].previous, 'old-bash');
    });

    it('revert deletes files agentenv created and clears the manifest', () => {
      const statePath = tempStatePath();
      const home = tempHome();
      const results = MANAGED.map((agent) => applyAgentShellFix(agent, bashExe, home));
      persist(results, bashExe, statePath);

      const reverted = revertShellFixes(statePath);
      assert.equal(reverted.length, 3);
      assert.ok(reverted.every((result) => result.action === 'removed'));
      for (const result of results) assert.equal(fs.existsSync(result.file), false);
      assert.equal(readShellFixState(statePath), null);
    });

    it('revert restores prior values and preserves unrelated user content', () => {
      const statePath = tempStatePath();

      const home = tempHome();
      const claudeFile = path.join(home, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(claudeFile), { recursive: true });
      fs.writeFileSync(
        claudeFile,
        JSON.stringify({ env: { CLAUDE_CODE_GIT_BASH_PATH: 'old-bash', KEEP: 'x' } }),
      );
      const results = [applyAgentShellFix('claude_code', bashExe, home)];
      persist(results, bashExe, statePath);

      const reverted = revertShellFixes(statePath);
      assert.equal(reverted[0].action, 'reverted');
      const settings = JSON.parse(fs.readFileSync(claudeFile, 'utf8'));
      assert.equal(settings.env.CLAUDE_CODE_GIT_BASH_PATH, 'old-bash');
      assert.equal(settings.env.KEEP, 'x');
    });

    it('revert removes an added opencode key and keeps the rest of the file', () => {
      const statePath = tempStatePath();
      const home = tempHome();
      const file = path.join(home, '.config', 'opencode', 'opencode.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ shell: '/bin/sh', theme: 'dark' }));
      persist([applyAgentShellFix('opencode', bashExe, home)], bashExe, statePath);

      assert.equal(revertShellFixes(statePath)[0].action, 'reverted');
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(config.shell, '/bin/sh');
      assert.equal(config.theme, 'dark');
      assert.equal('defaultShell' in config, false);
    });

    it('revert removes the injected [windows] section from a codex config', () => {
      const statePath = tempStatePath();
      const home = tempHome();
      const file = path.join(home, '.codex', 'config.toml');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '[model]\nwire_api = true\n');
      persist([applyAgentShellFix('codex_cli', bashExe, home)], bashExe, statePath);

      const reverted = revertShellFixes(statePath);
      assert.equal(reverted[0].action, 'reverted');
      const content = fs.readFileSync(file, 'utf8');
      assert.match(content, /\[model\]/);
      assert.doesNotMatch(content, /\[windows\]/);
      assert.doesNotMatch(content, /shell_path/);
    });

    it('revert reports absent when the value was already removed', () => {
      const statePath = tempStatePath();
      const home = tempHome();
      const file = path.join(home, '.config', 'opencode', 'opencode.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ theme: 'dark' }));
      writeShellFixState(
        mergeShellFixEntries(
          null,
          [
            {
              agent: 'opencode',
              file,
              createdFile: false,
              fields: [
                { key: 'shell', previous: null },
                { key: 'defaultShell', previous: null },
              ],
            },
          ],
          bashExe,
        ),
        statePath,
      );

      assert.equal(revertShellFixes(statePath)[0].action, 'absent');
    });

    it('revert of a mise entry deletes a config file agentenv created', () => {
      const statePath = tempStatePath();
      const file = path.join(tempHome(), '.config', 'mise', 'config.toml');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '[settings]\nshims_dir = "C:/Users/me/.local/bin"\n');
      writeShellFixState(
        mergeShellFixEntries(
          null,
          [
            {
              agent: 'mise',
              file,
              createdFile: true,
              fields: [{ key: 'shims_dir', previous: null, set: 'C:/Users/me/.local/bin' }],
            },
          ],
          'C:/Users/me/.local/bin',
        ),
        statePath,
      );

      const reverted = revertShellFixes(statePath)[0];
      assert.equal(reverted.action, 'removed');
      assert.equal(fs.existsSync(file), false);
      assert.equal(readShellFixState(statePath), null);
    });

    it('revert of a mise entry keeps an existing file but drops shims_dir', () => {
      const statePath = tempStatePath();
      const file = path.join(tempHome(), '.config', 'mise', 'config.toml');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '[settings]\nshims_dir = "C:/Users/me/.local/bin"\njobs = 4\n');
      writeShellFixState(
        mergeShellFixEntries(
          null,
          [
            {
              agent: 'mise',
              file,
              createdFile: false,
              fields: [{ key: 'shims_dir', previous: null, set: 'C:/Users/me/.local/bin' }],
            },
          ],
          'C:/Users/me/.local/bin',
        ),
        statePath,
      );

      const reverted = revertShellFixes(statePath)[0];
      assert.equal(reverted.action, 'reverted');
      assert.equal(fs.readFileSync(file, 'utf-8'), '[settings]\njobs = 4\n');
    });

    it('revert of a mise entry skips a user-changed shims_dir', () => {
      const statePath = tempStatePath();
      const file = path.join(tempHome(), '.config', 'mise', 'config.toml');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '[settings]\nshims_dir = "C:/user/edited"\n');
      writeShellFixState(
        mergeShellFixEntries(
          null,
          [
            {
              agent: 'mise',
              file,
              createdFile: false,
              fields: [{ key: 'shims_dir', previous: null, set: 'C:/Users/me/.local/bin' }],
            },
          ],
          'C:/Users/me/.local/bin',
        ),
        statePath,
      );

      const reverted = revertShellFixes(statePath)[0];
      assert.equal(reverted.action, 'skipped');
      assert.ok(fs.readFileSync(file, 'utf-8').includes('C:/user/edited'));
    });

    it('revert leaves a user-changed value untouched and keeps the manifest', () => {
      const statePath = tempStatePath();
      const home = tempHome();
      const file = path.join(home, '.claude', 'settings.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ theme: 'dark' }), { flag: 'w' });
      persist([applyAgentShellFix('claude_code', bashExe, home)], bashExe, statePath);

      fs.writeFileSync(file, JSON.stringify({ env: { CLAUDE_CODE_GIT_BASH_PATH: 'user-chosen' } }));
      const reverted = revertShellFixes(statePath);
      assert.equal(reverted[0].action, 'skipped');
      const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
      assert.equal(settings.env.CLAUDE_CODE_GIT_BASH_PATH, 'user-chosen');
      assert.equal(readShellFixState(statePath)?.entries.length, 1);
    });

    it('revert dry-run reports the action without writing', () => {
      const statePath = tempStatePath();
      const home = tempHome();
      persist([applyAgentShellFix('claude_code', bashExe, home)], bashExe, statePath);
      const file = path.join(home, '.claude', 'settings.json');

      const preview = revertShellFixes(statePath, true);
      assert.equal(preview[0].action, 'removed');
      assert.equal(fs.existsSync(file), true);
      assert.equal(readShellFixState(statePath)?.entries.length, 1);
    });
  });

  describe('checkGNUCoreutils and checkMissingUtilities', () => {
    it('skips the probe when the shell is already POSIX-compatible', () => {
      assert.deepEqual(checkMissingUtilities(true), []);
    });

    it('returns a boolean for the current platform', () => {
      assert.equal(typeof checkGNUCoreutils(), 'boolean');
    });
  });

  describe('removeTomlWindowsShellPath', () => {
    it('removes the line and the now-empty [windows] section', () => {
      const out = removeTomlWindowsShellPath('[model]\nx = 1\n\n[windows]\nshell_path = "b"\n');
      assert.match(out, /\[model\]/);
      assert.doesNotMatch(out, /\[windows\]/);
      assert.doesNotMatch(out, /shell_path/);
    });

    it('keeps the [windows] section when other keys remain', () => {
      const out = removeTomlWindowsShellPath('[windows]\nshell_path = "b"\nsomething_else = 1\n');
      assert.match(out, /\[windows\]/);
      assert.match(out, /something_else = 1/);
      assert.doesNotMatch(out, /shell_path/);
    });

    it('returns the content unchanged when there is no shell_path', () => {
      const content = '[model]\nx = 1\n';
      assert.equal(removeTomlWindowsShellPath(content), content);
    });
  });
});

describe('detectShell', () => {
  it('never runs `brew install` (or any brew subcommand other than --prefix) on macOS', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const fakeSpawnSync: typeof import('child_process').spawnSync = ((
      cmd: string,
      args?: string[],
    ) => {
      calls.push({ cmd, args: args ?? [] });
      return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<
        typeof import('child_process').spawnSync
      >;
    }) as typeof import('child_process').spawnSync;

    try {
      // detectShell() itself only ever calls the injected spawnSync for the
      // read-only `brew --prefix coreutils` probe; checkGNUCoreutils()
      // (unmocked here) never touches brew at all. Regardless of what either
      // reports, no call reaching this seam may be an install/list mutation.
      detectShell(fakeSpawnSync);
      assert.ok(calls.length > 0, 'expected the brew --prefix probe to run');
      for (const call of calls) {
        assert.equal(call.cmd, 'brew');
        assert.deepEqual(call.args, ['--prefix', 'coreutils']);
      }
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});

describe('gitBashCandidatePaths', () => {
  it('always includes the four machine-wide Program Files locations', () => {
    const candidates = gitBashCandidatePaths({});
    assert.ok(candidates.includes('C:\\Program Files\\Git\\bin'));
    assert.ok(candidates.includes('C:\\Program Files\\Git\\usr\\bin'));
    assert.ok(candidates.includes('C:\\Program Files (x86)\\Git\\bin'));
    assert.ok(candidates.includes('C:\\Program Files (x86)\\Git\\usr\\bin'));
  });

  it('adds the per-user %LOCALAPPDATA%\\Programs\\Git locations when set', () => {
    const candidates = gitBashCandidatePaths({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' });
    assert.ok(
      candidates.includes(path.join('C:\\Users\\me\\AppData\\Local', 'Programs', 'Git', 'bin')),
    );
    assert.ok(
      candidates.includes(
        path.join('C:\\Users\\me\\AppData\\Local', 'Programs', 'Git', 'usr', 'bin'),
      ),
    );
  });

  it('adds the scoop install locations from SCOOP, falling back to %USERPROFILE%\\scoop', () => {
    const withScoop = gitBashCandidatePaths({ SCOOP: 'D:\\scoop' });
    assert.ok(withScoop.includes(path.join('D:\\scoop', 'apps', 'git', 'current', 'bin')));

    const withUserProfile = gitBashCandidatePaths({ USERPROFILE: 'C:\\Users\\me' });
    assert.ok(
      withUserProfile.includes(
        path.join('C:\\Users\\me', 'scoop', 'apps', 'git', 'current', 'bin'),
      ),
    );
  });

  it('omits per-user and scoop candidates when neither env var is set', () => {
    const candidates = gitBashCandidatePaths({});
    assert.equal(candidates.length, 4);
  });
});

describe('findGitBashOnPath', () => {
  it('derives the Git Bash root from `where git` and checks its bin dirs', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-gitbash-'));
    const gitRoot = path.join(home, 'CustomGit');
    const usrBin = path.join(gitRoot, 'usr', 'bin');
    fs.mkdirSync(path.join(gitRoot, 'cmd'), { recursive: true });
    fs.mkdirSync(usrBin, { recursive: true });

    const fakeSpawnSync: typeof import('child_process').spawnSync = ((
      cmd: string,
      args?: string[],
    ) => {
      assert.equal(cmd, 'cmd.exe');
      assert.deepEqual(args, ['/c', 'where', 'git']);
      return {
        status: 0,
        stdout: `${path.join(gitRoot, 'cmd', 'git.exe')}\n`,
        stderr: '',
        pid: 0,
        output: [],
        signal: null,
      } as ReturnType<typeof import('child_process').spawnSync>;
    }) as typeof import('child_process').spawnSync;

    assert.equal(findGitBashOnPath(fakeSpawnSync), usrBin);
  });

  it('returns undefined when `where git` fails', () => {
    const fakeSpawnSync: typeof import('child_process').spawnSync = (() => {
      return { status: 1, stdout: '', stderr: '', pid: 0, output: [], signal: null } as ReturnType<
        typeof import('child_process').spawnSync
      >;
    }) as typeof import('child_process').spawnSync;

    assert.equal(findGitBashOnPath(fakeSpawnSync), undefined);
  });
});

const MANAGED: Array<'claude_code' | 'codex_cli' | 'opencode'> = [
  'claude_code',
  'codex_cli',
  'opencode',
];
