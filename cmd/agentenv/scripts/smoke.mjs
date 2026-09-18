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

// Full mise-installable catalog, derived from the compiled product constants
// so a future catalog addition is covered automatically. tokei (fallback-only)
// is excluded via requiresFallback; a tool that genuinely cannot run --version
// or install on a given OS can be exempted via the override maps below.
import { TOOL_KEYS, BINARY_MAP } from '../dist/config/schema.js';
import { MISE_TOOL_NAMES, PINNED_TOOL_VERSIONS } from '../dist/toolchain/mise.js';
import { requiresFallback } from '../dist/toolchain/fallbacks.js';

const FULL_TOOLS = TOOL_KEYS.filter((key) => !requiresFallback(key)).map((key) => {
  const miseName = MISE_TOOL_NAMES[key] ?? key;
  return {
    key,
    miseName,
    binary: BINARY_MAP[key],
    version: PINNED_TOOL_VERSIONS[miseName] ?? 'latest',
  };
});

// Escape hatches for OS-specific tool quirks (each entry needs a comment
// explaining its presence). Default empty: catalog *install* stays
// unconditional and every tool's `--version` is verified.
const INSTALL_EXCLUDED = {};
const EXECUTE_EXCLUDED = {};

// Windows: jless and ripgrep-all publish NO Windows release assets, so mise's
// aqua backend rejects them outright ("unsupported env: windows/amd64" —
// both only ship linux/darwin builds, see docs/research/new-tools-windows.md
// and tier-tools-windows.md). direnv IS available for Windows via aqua, but
// mise 2026.9.9's aqua backend extracts the PE binary without a .exe
// extension, so `mise which direnv` and any direct exec both fail on Windows
// (a regression from 2026.9.5, which passed — see tier-tools-windows.md).
// All three are genuinely unrunnable here and must be dropped from the
// generated [tools] block, or the acceptance `mise install` / `mise which`
// gate keeps failing on them.
if (process.platform === 'win32') {
  INSTALL_EXCLUDED.jless = 'Windows: no Windows release assets';
  INSTALL_EXCLUDED['ripgrep-all'] = 'Windows: no Windows release assets';
  INSTALL_EXCLUDED.direnv = 'Windows: mise 2026.9.9 aqua extracts without .exe extension';
}

const toolsBlock = FULL_TOOLS.filter((tool) => !INSTALL_EXCLUDED[tool.miseName])
  .map((tool) => `${tool.key} = true`)
  .join('\n');

const agentsBlock = REAL
  ? `claude_code = true
codex_cli = true
copilot = true
opencode = true`
  : `claude_code = true
codex_cli = true
copilot = true
opencode = true
gemini_cli = true
cursor = true
windsurf = true
cline = true
vibe = true`;

const config = `scope = "project"

[agents]
${agentsBlock}

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

const scrub = path.join(temp, 'scrub');
fs.mkdirSync(scrub, { recursive: true });
const noMiseEnv = {
  ...env,
  PATH: scrub,
  Path: scrub,
  HOME: home,
  USERPROFILE: home,
  XDG_DATA_HOME: scrub,
};

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

function run(args, cwd, runEnv = env) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    env: runEnv,
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

function runAllowingExit(args, cwd, runEnv) {
  try {
    return { status: 0, stdout: run(args, cwd, runEnv), stderr: '' };
  } catch (err) {
    return { status: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

const statusResult = runAllowingExit(['status'], project);
const statusOut = statusResult.stdout;
// The fixture enables tools that `apply --skip-mise-install` never installs,
// so drift (exit 1) is the expected signal — but a dev machine with every
// fixture tool already globally on PATH can legitimately exit 0, so accept
// both. The deterministic drift assertion lives in the built-CLI contract test
// (empty dir → 1), not here.
expect(
  statusResult.status === 0 || statusResult.status === 1,
  `status should exit 0 or 1, got ${statusResult.status}`,
);
expect(/Config:/.test(statusOut), `status should print a data line, got:\n${statusOut}`);

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
    execFileSync('mise', ['install'], {
      cwd: project,
      env: { ...process.env, MISE_YES: '1' },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('smoke FAIL: mise install (full catalog) exited non-zero');
    console.error(err.message);
    process.exit(1);
  }
  const installedTools = FULL_TOOLS.filter((tool) => !INSTALL_EXCLUDED[tool.miseName]);
  for (const tool of installedTools) {
    if (EXECUTE_EXCLUDED[tool.miseName]) continue;
    let resolved;
    try {
      resolved = execFileSync('mise', ['which', tool.binary], {
        cwd: project,
        env: process.env,
        encoding: 'utf-8',
      })
        .trim()
        .split(/\r?\n/)[0];
    } catch (err) {
      console.error(`smoke FAIL: mise could not resolve installed tool "${tool.binary}"`);
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
      // cwd: project — observed (ast-grep): `mise which` can resolve to a
      // path under an unversioned "latest" directory that is itself still a
      // mise-aware dispatcher requiring an active mise context (a directory
      // with the declaring mise.toml, or a global default version) to know
      // which concrete version to run, not a fully static binary.
      execFileSync(resolved, ['--version'], { cwd: project, env: process.env, encoding: 'utf-8' });
    } catch (err) {
      console.error(
        `smoke FAIL: "${tool.binary}" (${resolved}) did not run --version successfully`,
      );
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

  // Roundtrip: what the catalog install just put in the store must come back
  // out via `agentenv uninstall`. Runs under real process.env via execFileSync
  // (NOT the fake-HOME run helper) because on macOS/Ubuntu mise's data dir
  // derives from $HOME/XDG_DATA_HOME — the fake-HOME helper would probe an
  // empty store and both steps would pass vacuously. The config lives in the
  // project dir, so which agentenv.toml it uses is unaffected.
  try {
    execFileSync(process.execPath, [cli, 'uninstall', '--yes'], {
      cwd: project,
      env: process.env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error('smoke FAIL: agentenv uninstall --yes exited non-zero');
    console.error(err.stdout ?? '');
    console.error(err.stderr ?? '');
    process.exit(1);
  }

  // Verify genuine removal via `mise ls --json` (object keyed by tool name →
  // [{version, installed, ...}]): no catalog tool may have any entry with
  // installed === true. Not `mise which` (auto-reinstall under mise's
  // auto_install default) and not entry-absence (declared tools still appear).
  let lsAfter;
  try {
    lsAfter = execFileSync('mise', ['ls', '--json'], {
      cwd: project,
      env: process.env,
      encoding: 'utf-8',
    });
  } catch (err) {
    console.error('smoke FAIL: mise ls --json after uninstall failed');
    console.error(err.message);
    process.exit(1);
  }
  const installedAfter = new Set();
  for (const [name, entries] of Object.entries(JSON.parse(lsAfter))) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry.installed === true) installedAfter.add(name);
    }
  }
  for (const tool of installedTools) {
    expect(
      !installedAfter.has(tool.miseName),
      `tool "${tool.miseName}" is still installed after agentenv uninstall`,
    );
  }
}

if (!REAL) {
  expect(
    /gemini_cli|Gemini CLI|--gemini/.test(applyOut),
    `stub apply should mention gemini, got:\n${applyOut}`,
  );
  for (const { key } of FULL_TOOLS.filter((tool) => !INSTALL_EXCLUDED[tool.miseName])) {
    expect(statusOut.includes(key), `status should mention ${key}, got:\n${statusOut}`);
  }

  // Deterministic mise-less uninstall coverage (PATH/XDG scrubbed so no host
  // mise can leak in; node+CLI+rtk-stub are all reached by absolute path).
  const dry = runAllowingExit(['uninstall', '--dry-run'], project, noMiseEnv);
  expect(dry.status === 0, `uninstall --dry-run should exit 0, got ${dry.status}:\n${dry.stdout}`);
  expect(
    /state unknown \(mise not installed\)/.test(dry.stdout),
    `dry-run should note missing mise, got:\n${dry.stdout}`,
  );

  const guarded = runAllowingExit(['uninstall', '--yes'], project, noMiseEnv);
  expect(
    guarded.status === 1,
    `uninstall --yes should hit the mise gate (exit 1), got ${guarded.status}`,
  );
  expect(
    /mise was not found/.test(guarded.stderr),
    `gate should mention mise missing, got:\n${guarded.stderr}`,
  );

  const noop = path.join(temp, 'noop-project');
  fs.mkdirSync(noop, { recursive: true });
  fs.writeFileSync(
    path.join(noop, 'agentenv.toml'),
    'scope = "project"\n[agents]\nclaude_code = true\ncodex_cli = true\ncopilot = true\nopencode = true\n' +
      '[tools]\n' +
      'ripgrep = false\nfd = false\njq = false\nrtk = false\nast_grep = false\n' +
      'git_delta = false\ngh = false\ndifftastic = false\nyq = false\nbat = false\n' +
      'eza = false\nmiller = false\ntokei = false\nhyperfine = false\nfzf = false\n' +
      'just = false\nwatchexec = false\ndirenv = false\n',
  );
  const none = runAllowingExit(['uninstall', '--yes'], noop, noMiseEnv);
  expect(none.status === 0, `no-op uninstall should exit 0, got ${none.status}:\n${none.stdout}`);
  expect(/Nothing to uninstall\./.test(none.stdout), `no-op output missing, got:\n${none.stdout}`);
}

console.log(
  `smoke OK (${REAL ? 'real rtk + full-catalog install + uninstall roundtrip + setup --yes' : 'rtk stub + skip mise + mise-less uninstall paths'}): apply + status + uninstall verified for all configured agents`,
);
