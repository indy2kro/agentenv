# Adding an Agent Adapter

This guide explains how to wire a new AI-coding agent into `agentenv` so it
is covered by `agentenv configure`, `agentenv apply`, and `agentenv status`.
It assumes you already read `docs/plans/agentenv-dev-plan.md` (especially
§8 "Adapter architecture").

## What an adapter does

Each adapter owns one agent's integration surface:

- **Project drift files** — files inside the repo that tell the agent about
  the environment (e.g. `AGENTS.md`, `.github/copilot-instructions.md`).
- **User config files** — files in the agent's home config dir (e.g.
  `~/.claude/settings.json`, `~/.codex/config.toml`).
- **Hook wiring** — how the agent's command hooks get points at `rtk`
  (and/or the project's tools).

There are two supported styles; prefer the first:

| Style | When | Hook wiring | Writes |
|---|---|---|---|
| **rtk delegation** | rtk has a `rtk init <agent>` mode | `resolveRtkInit(...)(...FLAGS, cwd)` | owned by rtk (e.g. `RTK.md`) |
| **hand-written** | rtk has no mode (only Claude today) | adapter builds hooks itself | adapter-owned files |

## 1. Add the agent key

`AgentKey` lives in `src/config/schema.ts`:

1. Add the id to the `AGENT_KEYS` tuple.
2. Add `agents.<id>` boolean to `AgentenvConfig`, `DEFAULT_CONFIG`,
   `configToToml`, and `mergeWithDefaults` (follow the existing four entries).
3. Optionally add `rtk.init.<id>` to `RtkConfig` if rtk can wire this agent,
   and its TOML serialization/merge + `diffConfigs` entry.

## 2. Register command detection

`src/adapters/detect.ts` maps agent ids to the binary(ies) that prove the
agent is installed:

```ts
export const AGENT_COMMANDS: Record<AgentKey, string[]> = {
  // ...existing
  my_agent: ['my-agent-cli'],
};
```

An agent counts as installed when at least one listed command resolves.
`resolveBinary` (used by `agentenv status` for drift reporting) is keyed off
the same binary names — if your agent resolves on macOS/Linux via `which` and
Windows via `where`, no extra work is needed.

## 3. Write the adapter class

Create `src/adapters/<agent>.ts`, extending `BaseAdapter` from `base.ts`.
The abstract members you must implement:

| Member | Purpose |
|---|---|
| `getName()` | Display name used in `apply`/`status` output |
| `isInstalled()` | Usually `isAgentInstalled('<key>', detect)` |
| `getConfigDir()` | The agent's home config dir (may be `os.homedir()`-free; use `HOME`/`USERPROFILE` env like the existing adapters) |
| `initialize()` | Ensure dirs exist, create baseline config **without clobbering user content**, then wire hooks if `rtkEnabled` |
| `configureHooks()` | The hook-wiring step (delegate to `rtk init` or write hooks by hand) |
| `cleanup()` | Remove files this adapter created (never files owned by rtk) |
| `getEnvVars()` | Optional; e.g. Windows `SHELL = 'bash.exe'` shim for hook shells |

`AdapterResult` is the contract every method returns:

```ts
interface AdapterResult {
  success: boolean;
  message: string;
  filesCreated: string[];
  filesModified: string[];
  errors: string[];
}
```

### rtk delegation path

```ts
import { RTK_INIT_FLAGS, resolveRtkInit } from '../toolchain/rtk.js';

async configureHooks(): Promise<AdapterResult> {
  const result = newResult();
  const flags = RTK_INIT_FLAGS.my_agent; // add your flag set in rtk.ts
  const target = /* the file you expect on success */;
  const existed = fs.existsSync(target);

  const run = resolveRtkInit(this.config.rtkInit)(flags, this.config.baseDir);
  if (run.success) {
    if (!existed && fs.existsSync(target)) result.filesCreated.push(target);
    result.message = run.message;
  } else {
    result.success = false;
    result.errors.push(run.message + (run.stderr ? `: ${run.stderr.trim()}` : ''));
  }
  return result;
}
```

Notes:

- Add your flags to `RTK_INIT_FLAGS` in `src/toolchain/rtk.ts` **and verify
  them against the real rtk binary before shipping** — run the exact
  `rtk init <flags>` against both the pinned rtk version and the one on your
  PATH (see `docs/research/rtk-init-delegation.md`). Some flags that look
  legal are rejected (e.g. `--codex` rejects `--auto-patch`), and ones that
  are moot can add prompt risk.
- Keep the delegation flags minimal. `--auto-patch` is Claude-only; do not
  add it to other agents.
- Honor `this.config.rtkInit`: it lets tests and CI (via
  `AGENTENV_RTK_BIN`) substitute a deterministic stub.

### Hand-written path (Claude)

`ClaudeCodeAdapter` writes `~/.claude/settings.json` hooks (PreToolUse/
PostToolUse) and `CLAUDE.md` itself. Follow that pattern and keep the
"never clobber user content" rule: merge into existing files, create
baselines only when missing.

## 4. Register the adapter

- `src/adapters/index.ts` — export the class and (if applicable) entry in
  the factory that maps `AgentKey` → adapter instance.
- Feed it the same `AdapterConfig` shape the others get: `enabled` (from the
  agent toggle), `baseDir` (the project dir), `rtkEnabled`/`rtkInit` (from
  the `rtk` config + CLI wiring).

## 5. Status registration

`agentenv status` compares expected vs actual state against the files the
adapter may create. The rtk-delegated agents register their expected files in
`src/commands/status.ts` (the per-agent config file lists):
`RTK.md`, `.github/copilot-instructions.md`,
`.config/opencode/plugins/rtk.ts`. Add your adapter's expected files there so
drift shows up. Do **not** register files owned by rtk that live outside the
project without a strong reason.

## 6. Tests + the stub

- Add matching assertions to `src/adapters/adapters.test.ts` and
  `src/commands/apply.test.ts`, including the exact args asserted via
  `deepEqual` on the fake's recorded `calls`.
- Extend `test/fixtures/rtk-stub.mjs` with a `case` for your flag combo that
  mirrors the files real `rtk init` writes — this is what makes the
  deterministic CI smoke (`npm run smoke`, stub mode) cover your agent.
- If mise/apply needs new tools, add them to `PINNED_TOOL_VERSIONS` in
  `src/toolchain/mise.ts` only when agentenv calls the tool directly and it
  moves fast (see §10 of the plan).
- Package-lock must stay in sync (CI uses `npm ci`).

## 7. Verify

```sh
npm run build && npm test        # unit + integration
npm run smoke                    # deterministic stub-mode end-to-end
npm run smoke:real               # real rtk + real mise install
npm run lint && npm run format:check
```

CI runs lint/format/test/build and the stub smoke on all three OS; the
`smoke.yml` workflow re-runs `npm run smoke:real` on `main` pushes with a
real mise install.