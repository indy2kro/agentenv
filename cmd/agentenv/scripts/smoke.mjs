/**
 * End-to-end CLI smoke test.
 * Default (deterministic, no mise/rtk install required): runs the compiled
 * `agentenv` binary through a real subprocess with rtk delegated to the stub
 * fixture and mise install skipped. Fast; runs on every push (ci.yml).
 * `--real` (full acceptance): runs against a real `rtk init` on PATH, installs
 * the full Tier 1+2 tool catalog for real via mise, verifies each tool
 * actually runs (not just "detected"), and also exercises the unattended
 * `setup --yes` path. Slower and network-dependent; runs on `main` only
 * (smoke.yml).
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

// Tools actually installed and executed in --real mode. Each must support
// `--version` non-interactively. Tier 3 / custom-fallback tools are out of
// scope here (see docs/research/tier-tools-*.md for their own caveats).
const REAL_TOOLS = [
  ['rg', 'ripgrep'],
  ['fd', 'fd'],
  ['jq', 'jq'],
  ['rtk', 'rtk'],
  ['sg', 'ast_grep'],
  ['delta', 'git_delta'],
  ['gh', 'gh'],
  ['difft', 'difftastic'],
];

const toolsBlock = REAL
  ? REAL_TOOLS.map(([, key]) => `${key} = true`).join('\n')
  : 'ripgrep = true\nfd = true\njq = true\nrtk = true';

const config = `scope = "project"

[agents]
claude_code = true
codex_cli = true
copilot = true
opencode = true

[tools]
${toolsBlock}

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
const applyArgs = ['apply', '--skip-mise-install'];
if (!REAL) env.AGENTENV_RTK_BIN = stub;

// Real rtk must resolve on PATH for the delegated `rtk init`. Rather than
// depend on `apply`'s internal mise gate (flaky right after a fresh install)
// or on mise's version-dir layout, install the pinned rtk ourselves
// (exit-checked), resolve its true bin dir with `mise which rtk`, and prepend
// it to PATH before the (skip-mise) apply.
if (REAL) {
  const pre = path.join(temp, 'preinstall');
  fs.mkdirSync(pre, { recursive: true });
  fs.writeFileSync(path.join(pre, 'mise.toml'), '[tools]\nrtk = "0.49.0"\n');
  try {
    execFileSync('mise', ['install'], { cwd: pre, env, stdio: 'ignore' });
  } catch {
    console.error('smoke FAIL: mise install (rtk) exited non-zero');
    process.exit(1);
  }
  const rtkBin = execFileSync('mise', ['which', 'rtk'], { cwd: pre, env, encoding: 'utf-8' })
    .trim()
    .split(/\r?\n/)[0];
  // Windows stores PATH as `Path`; `{...process.env}` keeps its casing, so
  // read whichever key exists or the prepend would replace the whole PATH.
  const basePath = env.PATH ?? env.Path ?? '';
  const joinedPath = path.dirname(rtkBin) + (basePath ? path.delimiter + basePath : '');
  env.PATH = joinedPath;
  env.Path = joinedPath;
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
expect(
  /Tools: wrote .*mise\.toml/.test(applyOut),
  `apply should report mise.toml generation, got:\n${applyOut}`,
);
if (REAL) {
  expect(
    !/rtk binary not found on PATH/.test(applyOut),
    `delegation should resolve real rtk via mise bin dir, got:\n${applyOut}`,
  );
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

if (REAL) {
  // Acceptance: actually install the full Tier 1+2 catalog for real (against
  // the mise.toml apply just generated) and prove each tool runs, not just
  // that agentenv's own PATH-based detection thinks it's present. This is a
  // plain, independent `mise install` outside agentenv's own apply flow, so
  // it isn't tangled up in agentenv's shims_dir override timing (see the
  // rtk-preinstall block above) — it only asks "does mise actually install a
  // working binary for this tool on this OS," which is the acceptance
  // question that matters here.
  //
  // Real (unmodified) process.env throughout this section, not the isolated
  // fake-HOME `env` used above for Claude/Codex/OpenCode config isolation:
  // mise's own attestation/Sigstore cache and some tools' own home-directory
  // resolution (observed: git-delta on Windows) break against a synthetic
  // HOME/USERPROFILE that isn't a real user profile, and none of this needs
  // that isolation anyway — it never touches per-user config files.
  try {
    execFileSync('mise', ['install'], { cwd: project, env: process.env, stdio: 'inherit' });
  } catch (err) {
    console.error('smoke FAIL: mise install (full Tier 1+2 catalog) exited non-zero');
    console.error(err.message);
    process.exit(1);
  }
  for (const [binary] of REAL_TOOLS) {
    let resolved;
    try {
      resolved = execFileSync('mise', ['which', binary], {
        cwd: project,
        env: process.env,
        encoding: 'utf-8',
      })
        .trim()
        .split(/\r?\n/)[0];
    } catch (err) {
      console.error(`smoke FAIL: mise could not resolve installed tool "${binary}"`);
      console.error(err.message);
      process.exit(1);
    }
    if (process.platform !== 'win32') {
      // mise's zip-archive extraction (observed: ast-grep's release asset,
      // unlike the other tools' tar.gz) doesn't always preserve the
      // executable bit, unlike a shim (which mise always writes executable
      // itself) — set it explicitly since this check deliberately bypasses
      // the shim to verify the raw installed binary.
      try {
        fs.chmodSync(resolved, 0o755);
      } catch {
        // Non-fatal: if this fails, the --version run below will surface it.
      }
    }
    try {
      execFileSync(resolved, ['--version'], { env: process.env, encoding: 'utf-8' });
    } catch (err) {
      console.error(`smoke FAIL: "${binary}" (${resolved}) did not run --version successfully`);
      console.error(`  status: ${err.status}, signal: ${err.signal}`);
      console.error(`  stdout: ${err.stdout ?? ''}`);
      console.error(`  stderr: ${err.stderr ?? ''}`);
      process.exit(1);
    }
  }

  // Acceptance: the unattended setup path (`setup --yes`), a separate code
  // path from `apply` that most users on a fresh machine actually run first,
  // and which had no CI coverage at all before this.
  const setupProject = path.join(temp, 'setup-project');
  fs.mkdirSync(setupProject, { recursive: true });
  let setupOut;
  try {
    setupOut = run(
      ['setup', '--yes', '--agents', 'claude_code,codex_cli,copilot,opencode', '--no-tier2'],
      setupProject,
    );
  } catch (err) {
    console.error('smoke FAIL: setup --yes exited non-zero');
    console.error(err.stdout ?? '');
    console.error(err.stderr ?? '');
    process.exit(1);
  }
  expect(/Setup complete!/.test(setupOut), `setup --yes should complete, got:\n${setupOut}`);
  expect(
    fs.existsSync(path.join(setupProject, 'agentenv.toml')),
    'setup --yes should write agentenv.toml',
  );
  expect(fs.existsSync(path.join(setupProject, 'mise.toml')), 'setup --yes should write mise.toml');

  // Visibility only, not a pass/fail gate: doctor's tool-availability check
  // depends on the shims_dir agentenv would configure actually being live on
  // this job's PATH, which apply (run with --skip-mise-install above) never
  // touched — printed so a human reviewing CI logs can spot drift, without
  // making the acceptance run depend on that separate, already-tracked
  // shims_dir/PATH concern (see docs/research/tier0-shell-fix.md).
  try {
    console.log(run(['doctor'], project));
  } catch (err) {
    console.log(err.stdout ?? '');
  }
}

console.log(
  `smoke OK (${REAL ? 'real rtk + full Tier 1+2 install + setup --yes' : 'rtk stub + skip mise'}): apply + status full pipeline verified for all four agents`,
);
