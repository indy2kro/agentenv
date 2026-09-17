import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../index.js', import.meta.url));

function run(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
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
[rtk]
enabled = false
`,
    );
    const applied = run(['apply', '--skip-mise-install'], clean);
    assert.equal(applied.status, 0, `clean fixture apply failed: ${applied.stdout}`);
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
    assert.equal(run(['status'], empty).status, 1);
  });

  it('exits 0 for status on a drift-free applied config', () => {
    assert.equal(run(['status'], clean).status, 0);
  });

  it('emits parseable JSON with a matching exitCode field', () => {
    const missing = run(['status', '--json'], empty);
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
  });
});
