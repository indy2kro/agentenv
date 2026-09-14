/**
 * End-to-end CLI smoke test.
 * Default (deterministic, no mise/rtk install required): runs the compiled
 * `agentenv` binary through a real subprocess with rtk delegated to the stub
 * fixture and mise install skipped.
 * `--real` (full setup): runs against a real `rtk init` on PATH and lets
 * `apply` run `mise install` itself (used by the full-setup CI workflow).
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REAL = process.argv.includes('--real');
const pkgRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(pkgRoot, 'dist', 'index.js');
const stub = path.join(pkgRoot, 'test', 'fixtures', 'rtk-stub.mjs');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentenv-smoke-'));
const home = path.join(temp, 'home');
const project = path.join(temp, 'project');
fs.mkdirSync(home, { recursive: true });
fs.mkdirSync(project, { recursive: true });

const config = `scope = "project"

[agents]
claude_code = true
codex_cli = true
copilot = true
opencode = true

[tools]
ripgrep = true
fd = true
jq = true
rtk = true

[rtk]
enabled = true

[tier0]
check_enabled = true

[generate]
marker_start = "<!-- agentenv-managed-start -->"
marker_end = "<!-- agentenv-managed-end -->"
files = ["AGENTS.md", "CLAUDE.md"]
`;
fs.writeFileSync(path.join(project, 'agentenv.toml'), config);

const env = { ...process.env, HOME: home, USERPROFILE: home };
const applyArgs = REAL ? ['apply'] : ['apply', '--skip-mise-install'];
if (!REAL) env.AGENTENV_RTK_BIN = stub;

// Real rtk lives in the temp HOME's mise data dir on Unix (shims at
// ~/.local/share/mise/shims). `apply` runs `mise install` before delegating,
// so prepending that deterministic shim dir lets `rtk init` resolve on PATH
// (verified against mise 2026.9 on ubuntu: install drops a shim exactly there).
if (REAL) {
  env.PATH = [
    path.join(home, '.local', 'share', 'mise', 'shims'),
    path.join(home, '.local', 'bin'),
    env.PATH ?? '',
  ].join(path.delimiter);
}

function run(args, cwd) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function expect(cond, message) {
  if (!cond) {
    console.error(`smoke FAIL: ${message}`);
    process.exit(1);
  }
}

let applyOut;
try {
  applyOut = run(applyArgs, project);
} catch (err) {
  console.error('smoke FAIL: apply exited non-zero');
  console.error(err.stdout ?? '');
  console.error(err.stderr ?? '');
  process.exit(1);
}
expect(/Generated .*mise\.toml/.test(applyOut), `apply should report mise.toml generation, got:\n${applyOut}`);
if (REAL) {
  expect(/mise install completed/.test(applyOut), `apply should run mise install, got:\n${applyOut}`);
}

const checks = [
  [path.join(project, 'mise.toml'), 'mise.toml'],
  [path.join(project, 'AGENTS.md'), 'AGENTS.md'],
  [path.join(project, 'CLAUDE.md'), 'CLAUDE.md'],
  [path.join(project, 'RTK.md'), 'RTK.md (codex delegation)'],
  [path.join(project, '.github', 'copilot-instructions.md'), '.github/copilot-instructions.md'],
  [path.join(project, '.github', 'hooks', 'rtk-rewrite.json'), '.github/hooks/rtk-rewrite.json'],
  [path.join(home, '.claude', 'settings.json'), '~/.claude/settings.json'],
  [path.join(home, '.codex', 'config.toml'), '~/.codex/config.toml'],
];
if (!REAL) {
  // Real rtk resolves the opencode plugin dir on its own platform config path
  // (ignores HOME/USERPROFILE overrides on Windows), so only the stub mode can
  // assert the exact location.
  checks.push([
    path.join(home, '.config', 'opencode', 'plugins', 'rtk.ts'),
    '~/.config/opencode/plugins/rtk.ts (stub)',
  ]);
}
for (const [file, label] of checks) {
  expect(fs.existsSync(file), `${label} missing: ${file}`);
}
const miseToml = fs.readFileSync(path.join(project, 'mise.toml'), 'utf-8');
expect(/rtk = "0\.49\.0"/.test(miseToml), 'mise.toml pins rtk to the verified version');
JSON.parse(fs.readFileSync(path.join(project, '.github', 'hooks', 'rtk-rewrite.json'), 'utf-8'));
JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf-8'));
if (!REAL) {
  expect(
    fs.readFileSync(path.join(home, '.config', 'opencode', 'plugins', 'rtk.ts'), 'utf-8') ===
      '// rtk opencode plugin\nexport const plugin = {};\n',
    'opencode plugin is the rtk stub content',
  );
}

const statusOut = run(['status'], project);
expect(/Status complete/.test(statusOut), `status should complete, got:\n${statusOut}`);

console.log(`smoke OK (${REAL ? 'real rtk + mise install' : 'rtk stub + skip mise'}): apply + status full pipeline verified for all four agents`);