# Publish workflow design — npm publishing on version tags

Date: 2026-09-15
Status: implemented, pending the `NPM_TOKEN` repository secret

## Goal

Automate publishing `@indy2kro/agentenv` to the npm registry from GitHub
Actions, so a maintainer only has to bump `package.json` and push a `v*` tag.
The CLI is currently version `0.1.0` and was never published to npm.

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
- **Auth**: `NODE_AUTH_TOKEN` from the `NPM_TOKEN` repository secret; the
  `Setup Node` step writes the `.npmrc` `_authToken` line via `registry-url`.
- **Actions**: pinned to full commit SHAs with human-readable version
  comments, per AGENTS.md:
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1)
  - `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (v7.0.0)
  Dependabot's `github-actions` ecosystem bumps these together with their
  version comments.
- **Node**: single version `24` on `ubuntu-latest` (matches the slimmed CI
  matrix; the CLI requires Node >= 22.13.0).

## Responsibilities / open items

Step-by-step maintainer instructions (including how to create the npm token)
live in [`docs/guides/releasing.md`](../guides/releasing.md).

- [ ] Add the `NPM_TOKEN` secret to the repository (Settings > Secrets and
  variables > Actions) with an npm granular access token that has
  `publish` scope for the `@indy2kro` scope, **Bypass 2FA** enabled, and the
  maximum allowed lifetime. Write-capable tokens are capped at 90 days (classic
  tokens are gone), so rotation is a recurring maintenance task. See
  [`docs/guides/releasing.md`](../guides/releasing.md) for the exact steps.
- [ ] First publish: bump `package.json` to `1.0.0` (or keep `0.1.0`),
  `git tag v<version>`, push the tag.
- [ ] Confirm the generated provenance appears under the release's
  "Attestations" tab on GitHub and the npm package page.

## Not included (deliberately)

- No auto-tagging / semantic-release bot — tag creation stays manual.
- No `create-github-release` action — tag-based publishing is enough for now;
  a GitHub release can be crafted from the same tag later without workflow
  changes.
- No matrix of Node versions for publish — the artifact is built once on the
  current LTS and consumed by all Node >= 22.13.0 consumers.