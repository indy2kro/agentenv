# Publish workflow design — one-button npm releases from GitHub

Date: 2026-09-15
Status: implemented; publish.yml replaced by release.yml (workflow_dispatch one-button release); pending one-time npm-side Trusted Publisher reconfiguration to `release.yml`

## Goal

Automate publishing `@indy2kro/agentenv` to the npm registry from GitHub
Actions, so a maintainer only has to choose the version in the GitHub UI. The
CLI shipped its first public version (`0.1.0`) on the registry before this
workflow existed; from here on, releases go through it.

## Decisions

- **Trigger**: a `workflow_dispatch` `release.yml` workflow with a
  `patch`/`minor`/`major` choice (plus an optional exact `custom-version`
  override) — one button in the GitHub Actions tab. Manual, explicit, and
  reversible, like the original tag-push trigger, but without the human having
  to edit files or git tags locally.
- **Version discipline**: the workflow computes the target version and applies
  it with `npm version <target> --no-git-tag-version`, which updates
  `package.json` **and** `package-lock.json` together — the two can never
  drift apart again (the original manual bump did drift: lock root said `0.1.0`
  while package.json said `0.1.1`). A guard verifies the target isn't already
  on the registry before doing anything, and a post-bump check asserts only the
  two version files changed and `--version` reports the new value.
- **Provenance**: publish with `npm publish --provenance` and
  `permissions: id-token: write` so the registry gets a signed attestation for
  every published tarball. Requires `fetch-depth: 0` (the tag must point at a
  commit reachable from the checkout for OIDC resolution).
- **Gate before publish**: a single job bumps, builds, lints, format-checks,
  runs the full test suite and the smoke pipeline (rtk stub, mise skipped), and
  asserts the tree is clean / the bump only touched version files — CI can only
  publish from a clean, green tree.
- **Contents check**: `npm pack --dry-run` output is inspected — `dist/index.js`,
  `README.md`, and `LICENSE` must be present and no `*.test.*` files may leak
  into the tarball.
- **Dist-tags**: `latest` for plain versions, `beta` when the version contains
  a `-` (so experimental/RCs never shadow stable). `--tag` is explicit.
- **Tag + release creation**: `npm version` no longer creates a tag (the human
  no longer does either) — the workflow commits `chore: release vX.Y.Z`,
  creates annotated tag `vX.Y.Z`, pushes commit + tag, and creates a GitHub
  release via `gh release create --generate-notes`. This needs
  `permissions: contents: write`.
- **Auth**: **npm Trusted Publishing (OIDC)** — no long-lived token. The
  workflow is registered as the package's Trusted Publisher on the npm side
  (`indy2kro` / `agentenv` / workflow `release.yml`, allowed action `npm
  publish`), and `npm publish` authenticates via the GitHub Actions OIDC token
  (`permissions: id-token: write`, npm >= 11.5.1 — the workflow upgrades npm,
  and the publish step sets **no** `NODE_AUTH_TOKEN` so npm does not fall back
  to the legacy token path). Chosen over the original `NPM_TOKEN` secret plan:
  write tokens cap at 90 days (constant rotation), EOTP required Bypass 2FA,
  and npm is restricting 2FA-bypass tokens to **stage + human approval only
  around January 2027** — a token is a stopgap, OIDC is the supported path.
- **Actions**: pinned to full commit SHAs with human-readable version
  comments, per AGENTS.md:
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1)
  - `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (v7.0.0)
  Dependabot's `github-actions` ecosystem bumps these together with their
  version comments.
- **Node**: single version `24` on `ubuntu-latest` (matches the slimmed CI
  matrix; the CLI requires Node >= 22.13.0).

## Responsibilities / open items

Step-by-step maintainer instructions (including the npm-side Trusted Publisher
setup) live in [`docs/guides/releasing.md`](../guides/releasing.md).

- [ ] Configure the Trusted Publisher on npm for `@indy2kro/agentenv`:
  npmjs.com → package → Settings → Trusted Publisher → GitHub Actions,
  owner `indy2kro`, repo `agentenv`, workflow filename `release.yml`, allowed
  action `npm publish`. Recommended: set Publishing access to "Require 2FA and
  disallow tokens" and delete the leftover `NPM_TOKEN` secret. Exact steps in
  [`docs/guides/releasing.md`](../guides/releasing.md).
- [ ] Next release: run the `Release` workflow from the Actions tab (pick
  `patch`/`minor`/`major` or an exact `custom-version`). No local edits or tag
  pushes needed.
- [ ] After each publish, confirm the generated provenance appears under the
  release's "Attestations" tab on GitHub and the npm package page.

## Not included (deliberately)

- No auto-bump / semantic-release bot — the human still picks the version (via
  the workflow inputs). Version increments happen at release time, not on every
  commit.
- No matrix of Node versions for publish — the artifact is built once on the
  current LTS and consumed by all Node >= 22.13.0 consumers.