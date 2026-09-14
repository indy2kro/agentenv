# Optional Upstream Integrations Design

## Goal

Extend agentenv with optional upstream-tracked integrations without turning
agentenv into a skill marketplace, plugin runtime, or fork of third-party
projects.

The first integration is Superpowers
([`obra/superpowers`](https://github.com/obra/superpowers)). GitHub CLI (`gh`)
remains a normal Tier 2 tool and gains authentication visibility in
`agentenv status`, but agentenv never performs GitHub login or handles tokens.

## Design boundaries

Agentenv has three separate layers:

1. **Toolchain** — mise-managed command-line tools, including `gh` and `rtk`.
2. **Agent configuration** — shared instructions, Tier 0 shell settings, and
   native agent adapters.
3. **Optional upstream integrations** — third-party skills or methodologies
   installed through documented native mechanisms.

The integration layer is an orchestration layer only. It is parallel to the
existing per-agent adapters: agent adapters own agentenv's generated
configuration, while integration adapters invoke and observe third-party
installation mechanisms. Integration adapters must not become a second plugin
runtime or replace the existing adapter registry.

The integration layer must not:

- vendor or fork third-party skill content;
- reimplement third-party plugin, hook, or skill formats;
- silently install remote executable content;
- become a general-purpose marketplace or skill manager;
- collect, store, or transmit credentials.

## Configuration

Add an optional `integrations` section to `agentenv.toml`:

```toml
[integrations.superpowers]
enabled = false
source = "github:obra/superpowers"
ref = "v6.3.0"
scope = "user"
agents = ["claude_code", "codex_cli", "copilot", "opencode"]
allow_hooks = false
allow_external_requests = false
```

Defaults:

- integrations are disabled;
- the Superpowers source is `github:obra/superpowers`;
- the configured ref is explicit and inspectable;
- scope defaults to the configured agentenv scope;
- hooks and external requests require explicit opt-in;
- no integration is included in the default Simple-mode profile.

The schema must reject unknown integration keys, invalid agent names, invalid
scopes, and malformed refs. Validation warnings may identify a configured
integration that cannot be installed for a selected agent, but malformed
configuration is an error.

The config core must expose integrations through the same load, save, validate,
and diff paths already used for tools and agents. `setup` and `configure`
preserve existing integration settings and do not enable Superpowers through
Simple mode. Advanced mode may expose an explicit integration opt-in only after
showing its source, ref, selected agents, scope, hooks setting, and external
request setting.

## Integration adapter contract

Introduce a small adapter contract for optional integrations:

- `getName()`
- `isEnabled(config)`
- `detect(baseDir, config)`
- `apply(baseDir, config)`
- `status(baseDir, config)`

The contract returns structured results containing:

- integration name;
- source and ref;
- selected scope and agents;
- installed/detected state;
- changed files or native commands;
- warnings and errors.

The first adapter is Superpowers. It must remain narrow and use the
integration's documented native installation mechanism for each supported
agent. It must not copy or synthesize Superpowers files. If a host cannot
install a configured ref non-interactively or safely, the adapter must report
the required manual action instead of executing an unreviewed remote command.

Each adapter must receive injectable command and filesystem runners so tests can
verify command construction without contacting GitHub or modifying a real home
directory. The adapter may invoke only a fixed, reviewed allowlist of native
installer commands for a known agent; arbitrary commands from TOML are invalid.
Remote source URLs and refs are data passed to those commands, never shell
fragments. Native installers that cannot accept a pinned ref must be reported
as manual/unsupported rather than silently falling back to a floating branch.

Future integrations may use the same contract, but no generic marketplace
resolver is required until a second integration demonstrates materially
different behavior.

## Apply behavior

`agentenv apply` processes integrations after core generated files and tool
installation:

1. Skip disabled integrations.
2. Resolve and validate the configured source/ref.
3. Detect the selected agents and existing integration state.
4. Require explicit permission for hooks or external requests.
5. Invoke only documented native installation commands.
6. Preserve user-owned files and report every external side effect.
7. Return a failure for an installation error; never convert it into a
   success-shaped fallback.

Noninteractive `apply` must not prompt. If installation requires interactive
agent UI confirmation, the adapter reports `manual action required` and leaves
the integration unchanged. Interactive `setup`/`configure` must display the
full source/ref/scope/agent/hook/external-request summary and obtain explicit
confirmation before invoking any installer.

Applying the same configuration twice must not reinstall an integration that is
already present at the requested ref. Changing the ref must be reported as an
explicit update.

## Status behavior

`agentenv status` adds an **Integrations** section. For each configured
integration it reports:

- enabled/disabled;
- source and ref;
- scope;
- selected agents;
- installed, missing, unsupported, or drifted state;
- whether hooks or external requests are enabled.

Example:

```text
Integrations:
  Superpowers
    enabled: yes
    source: github:obra/superpowers
    ref: v6.3.0
    scope: user
    Claude Code: installed
    Codex CLI:    installed
    Copilot:      unsupported/not detected
    OpenCode:     installed
    drift: no
```

The existing **Tools** section keeps `gh` as a Tier 2 tool and adds:

- installed/missing state;
- authenticated/unauthenticated/unknown state when `gh auth status` can be
  checked non-interactively.

The auth probe is exactly `gh auth status --hostname github.com` with stdout
and stderr captured only for classification. Exit code zero means
authenticated; a documented unauthenticated exit means unauthenticated; an
unrecognized failure means unknown. Output is never printed verbatim.

Agentenv must never invoke `gh auth login`, `gh auth token`, or
`gh auth setup-git`; it must not read token values, print token contents, or
modify GitHub credential storage. Authentication status is informational and
never blocks `apply`.

## Safety and trust model

Third-party integration installation is an explicit user action through the
configuration file or interactive wizard. Agentenv must display the source,
ref, target agents, scope, hooks setting, and external-request setting before
installing through an interactive flow.

For noninteractive `apply`, explicit enablement in `agentenv.toml` is the
consent to install the reviewed integration, but it is not consent to broaden
the command allowlist, enable hooks, or enable external requests. Those
settings must be true in configuration before the corresponding behavior can
occur. Every command and file path produced by an integration adapter must be
included in its structured result and human-readable apply message.

The default for external requests is disabled. Superpowers documents an
optional visual companion that can make an external request; agentenv must
not enable that behavior implicitly and should surface the opt-out/consent
setting in status and apply output.

Refs should be pinned for reproducibility. Floating refs such as `main` may be
accepted only with a validation warning and must never be introduced by the
default configuration.

## Testing

Add tests for:

- schema parsing, defaults, invalid integration keys, agent lists, scopes, and
  refs;
- deterministic configuration serialization and diff reporting;
- adapter selection and disabled-integration no-op behavior;
- Superpowers detection and native-command delegation using injectable runners;
- refusal to execute when hooks or external requests are not explicitly
  allowed;
- apply idempotency and failure propagation;
- status output for installed, missing, unsupported, and drifted integrations;
- setup/configure preserving integrations and requiring explicit advanced-mode
  opt-in;
- `gh` authentication reporting without exposing credential values, and
  verifying forbidden auth commands are never invoked.

Use stubs for external commands in unit tests. CI smoke tests may verify
command construction and file detection, but must not require real third-party
agent sessions or real GitHub credentials.

## Non-goals

- Bundling Superpowers or any other third-party skill content.
- Installing arbitrary skills from a marketplace.
- Replacing native agent plugin managers.
- Managing GitHub authentication.
- Making Superpowers part of the default setup profile.
