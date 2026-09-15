# Publish workflow design — npm publishing on version tags

Date: 2026-09-15
Status: implemented; auth migrated to Trusted Publishing (OIDC), pending one-time
npm-side configuration of the trusted publisher for `@indy2kro/agentenv`

## Goal

Automate publishing `@indy2kro/agentenv` to the npm registry from GitHub
Actions, so a maintainer only has to bump `package.json` and push a `v*` tag.
The CLI shipped its first public version (`0.1.0`) on the registry before this
workflow existed; from here on, releases go through it.

## Decisions

- **Trigger**: a dedicated `publish.yml` workflow on `push: tags: ['v*']`
  (Approach A from the design session). Tag-driven, not commit-driven, so a
  publish is an explicit, reversible action. No auto-bump bot; the tag is
  created by the human after bumping `package.json`.
- **Version discipline**: the tag name must equal `v<package.json.version>`
  exactly. A strict guard step fails the build otherwise — this prevents
  mismatched tags drifting from the metadata npm actually receives.
- **Provenance**: publish with `npm publish --provenance` and
  `permissions: id-token: write` so the registry gets a signed attestation for
  every published tarball. Requires `fetch-depth: 0` (the tag must point at a
  commit reachable from the checkout for OIDC resolution).
- **Gate before publish**: a single job builds, lints, format-checks, runs the
  full test suite and the smoke pipeline (rtk stub, mise skipped), and asserts
  `git diff --exit-code` — CI can only publish from a clean, green tree.
- **Contents check**: `npm pack --dry-run` output is inspected — `dist/index.js`,
  `README.md`, and `LICENSE` must be present and no `*.test.*` files may leak
  into the tarball.
- **Dist-tags**: `latest` for plain versions, `beta` when the version contains
  a `-` (so experimental/RCs never shadow stable). `--tag` is explicit.
- **Auth**: **npm Trusted Publishing (OIDC)** — no long-lived token. The
  workflow is registered as the package's Trusted Publisher on the npm side
  (`indy2kro` / `agentenv` / workflow `publish.yml`, allowed action `npm
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
  owner `indy2kro`, repo `agentenv`, workflow filename `publish.yml`, allowed
  action `npm publish`. Recommended: set Publishing access to "Require 2FA and
  disallow tokens" and delete the leftover `NPM_TOKEN` secret. Exact steps in
  [`docs/guides/releasing.md`](../guides/releasing.md).
- [ ] Next release: bump `package.json` (and `package-lock.json`),
  `git tag v<version>`, push the tag.
- [ ] After each publish, confirm the generated provenance appears under the
  release's "Attestations" tab on GitHub and the npm package page.

## Not included (deliberately)

- No auto-tagging / semantic-release bot — tag creation stays manual.
- No `create-github-release` action — tag-based publishing is enough for now;
  a GitHub release can be crafted from the same tag later without workflow
  changes.
- No matrix of Node versions for publish — the artifact is built once on the
  current LTS and consumed by all Node >= 22.13.0 consumers.