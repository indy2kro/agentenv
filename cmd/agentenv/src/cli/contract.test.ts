import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../index.js', import.meta.url));

function run(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

describe('CLI exit-code contract', () => {
  let empty: string;
  let clean: string;
  let wipe: string;
  let agentsonly: string;
  let noMiseEnv: NodeJS.ProcessEnv;
  let shellEnv: NodeJS.ProcessEnv;

  before(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-contract-'));
    empty = path.join(root, 'empty');
    clean = path.join(root, 'clean');
    fs.mkdirSync(empty, { recursive: true });
    fs.mkdirSync(clean, { recursive: true });
    // Default-enabled agents/tools (claude_code, codex_cli, ripgrep, ...) would
    // drift on any machine that has an installed-but-unconfigured agent binary
    // or a missing tool, so the fixture must disable every agent and tool
    // explicitly to guarantee a deterministic drift-free "clean" state.
    fs.writeFileSync(
      path.join(clean, 'agentenv.toml'),
      `scope = "project"
[agents]
claude_code = false
codex_cli = false
copilot = false
opencode = false
gemini_cli = false
cursor = false
windsurf = false
cline = false
vibe = false
[tools]
ripgrep = false
fd = false
jq = false
rtk = false
ast_grep = false
git_delta = false
gh = false
difftastic = false
yq = false
bat = false
eza = false
miller = false
tokei = false
hyperfine = false
fzf = false
just = false
watchexec = false
direnv = false
ripgrep_all = false
zoxide = false
shellcheck = false
uv = false
xh = false
actionlint = false
gitleaks = false
gum = false
glow = false
jless = false
sd = false
tealdeer = false
duckdb = false
qsv = false
taplo = false
hadolint = false
trivy = false
[rtk]
enabled = false
`,
    );
    const applied = run(['apply', '--skip-mise-install'], clean);
    assert.equal(applied.status, 0, `clean fixture apply failed: ${applied.stdout}`);

    // "wipe" enables tools but is never applied/installed; it is the exit-1
    // gate and --dry-run fixture.
    wipe = path.join(root, 'wipe');
    fs.mkdirSync(wipe, { recursive: true });
    fs.writeFileSync(
      path.join(wipe, 'agentenv.toml'),
      `scope = "project"
[agents]
claude_code = false
codex_cli = false
copilot = false
opencode = false
gemini_cli = false
cursor = false
windsurf = false
cline = false
vibe = false
[tools]
ripgrep = true
fd = true
`,
    );
    // "agentsonly" declares no mise-manageable tools at all: the no-op (exit 0,
    // "Nothing to uninstall.") path, which must not require mise. Note the
    // explicit all-false [tools] block: mergeWithDefaults enables the default
    // tools when the section is absent, which would turn this into a failing
    // gate hit. (Same reason the "clean" fixture disables everything.)
    agentsonly = path.join(root, 'agentsonly');
    fs.mkdirSync(agentsonly, { recursive: true });
    fs.writeFileSync(
      path.join(agentsonly, 'agentenv.toml'),
      `scope = "project"
[agents]
claude_code = false
codex_cli = false
[tools]
ripgrep = false
fd = false
jq = false
rtk = false
ast_grep = false
git_delta = false
gh = false
difftastic = false
yq = false
bat = false
eza = false
miller = false
tokei = false
hyperfine = false
fzf = false
just = false
watchexec = false
direnv = false
`,
    );
    // A mise-absent environment, deterministic on any machine: no PATH lookup
    // can find mise, and HOME/XDG point at empty dirs so no real config leaks.
    const scrub = path.join(root, 'scrub');
    fs.mkdirSync(scrub, { recursive: true });
    noMiseEnv = {
      ...process.env,
      PATH: scrub,
      Path: scrub,
      HOME: scrub,
      XDG_DATA_HOME: scrub,
    };

    // `shell-fix` reads/writes a per-user manifest, so its runs must be
    // sandboxed to a temp HOME/XDG or they would touch the developer's real
    // ~/.config/agentenv/shell-fix-state.json.
    shellEnv = {
      ...process.env,
      HOME: scrub,
      USERPROFILE: scrub,
      XDG_CONFIG_HOME: path.join(scrub, 'xdg'),
    };
  });

  it('exits 0 for --help and --version', () => {
    assert.equal(run(['--help'], empty).status, 0);
    assert.equal(run(['--version'], empty).status, 0);
  });

  it('exits 2 for unknown option and unknown command', () => {
    assert.equal(run(['--definitely-not-a-flag'], empty).status, 2);
    assert.equal(run(['frobnicate'], empty).status, 2);
  });

  it('exits 1 for status with no config', () => {
    assert.equal(run(['status'], empty, shellEnv).status, 1);
  });

  it('exits 1 for apply with no config instead of silently applying defaults', () => {
    const result = run(['apply'], empty, shellEnv);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No agentenv\.toml found/);
  });

  it('exits 0 for status on a drift-free applied config', () => {
    assert.equal(run(['status'], clean).status, 0);
  });

  it('emits parseable JSON with a matching exitCode field', () => {
    const missing = run(['status', '--json'], empty, shellEnv);
    assert.equal(missing.status, 1);
    const missingJson = JSON.parse(missing.stdout);
    assert.equal(missingJson.command, 'status');
    assert.equal(missingJson.config, null);
    assert.equal(missingJson.exitCode, 1);

    const ok = run(['status', '--json'], clean);
    assert.equal(ok.status, 0);
    assert.equal(JSON.parse(ok.stdout).exitCode, 0);
    assert.equal(ok.stderr, '', `status --json should be silent on stderr: ${ok.stderr}`);

    // doctor inspects the ambient machine (mise, shims, Git Bash), so its exit
    // code is environment-dependent — assert the JSON is self-consistent and
    // silent on stderr, not a fixed code.
    const doctor = run(['doctor', '--json'], clean);
    const doctorJson = JSON.parse(doctor.stdout);
    assert.equal(doctorJson.command, 'doctor');
    assert.equal(doctorJson.exitCode, doctorJson.status === 'fail' ? 1 : 0);
    assert.equal(doctor.stderr, '', `doctor --json should be silent on stderr: ${doctor.stderr}`);
  });

  it('exits 2 for a doctor --section that matches no section', () => {
    const result = run(['doctor', '--section', 'not-a-real-section'], clean);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /No doctor section matched "not-a-real-section"/);
  });

  it('suppresses banner chrome when stdout is piped', () => {
    const piped = run(['status'], clean);
    assert.equal(piped.status, 0);
    assert.doesNotMatch(
      piped.stdout,
      /===/,
      `piped status should have no banners: ${piped.stdout}`,
    );
  });

  it('rejects --json on mutating commands as a usage error', () => {
    assert.equal(run(['apply', '--json'], clean).status, 2);
    assert.equal(run(['setup', '--json'], clean).status, 2);
    assert.equal(run(['uninstall', '--json'], clean).status, 2);
  });

  it('rejects an invalid --scope value as a usage error on every scope-taking command', () => {
    for (const args of [
      ['apply', '--scope', 'usre'],
      ['update', '--scope', 'usre'],
      ['uninstall', '--scope', 'usre'],
      ['setup', '--yes', '--scope', 'usre'],
    ]) {
      const result = run(args, clean);
      assert.equal(result.status, 2, `${args.join(' ')} should be a usage error`);
      assert.match(result.stderr, /invalid --scope "usre"/);
    }
  });

  it('apply --scope user targets the user config dir, matching update/uninstall/setup', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-apply-scope-'));
    const userDir = path.join(home, '.config', 'agentenv');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-apply-scope-cwd-'));
    const userEnv: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
    delete userEnv.XDG_CONFIG_HOME;

    // No agentenv.toml at the user scope yet.
    const missing = run(['apply', '--scope', 'user'], cwd, userEnv);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No agentenv\.toml found at/);
    assert.match(missing.stderr, /scope user/);

    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDir, 'agentenv.toml'),
      'scope = "user"\n[agents]\nclaude_code = false\ncodex_cli = false\n[tools]\n',
    );
    const applied = run(['apply', '--scope', 'user', '--skip-mise-install'], cwd, userEnv);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(fs.existsSync(path.join(userDir, 'mise.toml')), true);
    assert.equal(fs.existsSync(path.join(cwd, 'mise.toml')), false);
  });

  it('shell-fix reports an empty manifest and is a revert no-op (sandboxed)', () => {
    const show = run(['shell-fix', '--json'], clean, shellEnv);
    assert.equal(show.status, 0);
    const json = JSON.parse(show.stdout);
    assert.equal(json.command, 'shell-fix');
    assert.deepEqual(json.recorded, []);
    assert.equal(json.exitCode, 0);
    assert.equal(show.stderr, '', `shell-fix --json should be silent on stderr: ${show.stderr}`);

    const revert = run(['shell-fix', '--revert'], clean, shellEnv);
    assert.equal(revert.status, 0);
    assert.match(revert.stdout, /Nothing to revert/);
  });

  it('rejects shell-fix --revert --json as a usage error', () => {
    assert.equal(run(['shell-fix', '--revert', '--json'], clean, shellEnv).status, 2);
  });

  it('rejects shell-fix --dry-run without --revert as a usage error', () => {
    assert.equal(run(['shell-fix', '--dry-run'], clean, shellEnv).status, 2);
  });

  it('suggests a close command name on typos', () => {
    const typo = run(['statsu'], clean);
    assert.equal(typo.status, 2);
    assert.match(typo.stderr, /did you mean/i);
  });

  it('apply --dry-run previews without writing (no "wrote" lines, exit 0)', () => {
    const dry = run(['apply', '--dry-run'], clean);
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, /Config: /);
    assert.match(dry.stdout, /Dry run complete/);
    assert.doesNotMatch(dry.stdout, /wrote/);
  });

  it('exits 1 for uninstall with no config (operational failure)', () => {
    const missing = run(['uninstall'], empty, shellEnv);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /No agentenv\.toml found/);
  });

  it('exits 2 for an unknown tool arg on uninstall', () => {
    const unknown = run(['uninstall', 'totally-not-a-tool'], wipe, shellEnv);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /Unknown tool\(s\) to uninstall: totally-not-a-tool/);
  });

  it('rejects --json and unknown flags on uninstall as usage errors', () => {
    assert.equal(run(['uninstall', '--json'], wipe).status, 2);
    assert.equal(run(['uninstall', '--nope'], wipe).status, 2);
  });

  it('uninstall --dry-run exits 0 and lists targets without a mise', () => {
    const dry = run(['uninstall', '--dry-run'], wipe, noMiseEnv);
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, /rg/);
    assert.match(dry.stdout, /state unknown \(mise not installed\)/);
  });

  it('uninstall --yes is a fail-closed guard when tools are configured but mise is absent', () => {
    const guarded = run(['uninstall', '--yes'], wipe, noMiseEnv);
    assert.equal(guarded.status, 1);
    assert.match(guarded.stderr, /mise was not found/);
  });

  it('uninstall --yes is a no-op (exit 0) when no mise-managed tools are configured', () => {
    const none = run(['uninstall', '--yes'], agentsonly, noMiseEnv);
    assert.equal(none.status, 0);
    assert.match(none.stdout, /Nothing to uninstall\./);
  });

  it('completion emits a script covering every command for each supported shell', () => {
    const commands = [
      'setup',
      'apply',
      'status',
      'update',
      'doctor',
      'uninstall',
      'completion',
      'shell-fix',
    ];
    for (const shell of ['bash', 'zsh', 'fish', 'powershell']) {
      const out = run(['completion', shell], clean);
      assert.equal(out.status, 0, `${shell} completion should exit 0: ${out.stderr}`);
      for (const command of commands) {
        assert.match(
          out.stdout,
          new RegExp(`\\b${command}\\b`),
          `${shell} should complete ${command}`,
        );
      }
      assert.match(out.stdout, /(--debug|-l debug)/, `${shell} should complete the global flags`);
    }
  });

  it('rejects an unsupported completion shell as a usage error', () => {
    assert.equal(run(['completion', 'cmd.exe'], clean).status, 2);
    assert.equal(run(['completion'], clean).status, 2);
  });
});
