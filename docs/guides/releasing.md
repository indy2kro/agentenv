# Releasing `@indy2kro/agentenv`

How the package gets to npm, how to cut a release, and how to connect the npm
account so GitHub Actions can publish it (Trusted Publishing / OIDC — no token).

> Short version: releasing is **one button and fully automated**. In the repo's
> **Actions** tab, run the **Release** workflow
> (`.github/workflows/release.yml`), pick `patch`/`minor`/`major` (or type an
> exact version), and it bumps the version, gates the tree, checks the
> tarball, runs `npm publish --provenance` via Trusted Publishing (OIDC), tags
> the release, and creates the GitHub release. The workflow itself is
> `.github/workflows/release.yml`.

## What "publishing" looks like

```text
Run "Release" workflow (ubuntu-latest, Node 24) with patch|minor|major or an exact version
   ├─ Bumps package.json + package-lock.json via `npm version` (single source of truth)
   ├─ Verifies the target version isn't already published
   ├─ Gate: build, lint, format:check, test, smoke
   ├─ Verifies working tree is clean / bump only touched version files
   ├─ npm pack --dry-run content check       (dist/, README, LICENSE)
   ├─ Dist-tag: "latest" unless version has a "-" → "beta"
   ├─ Commits "chore: release vX.Y.Z" and tags vX.Y.Z
   ├─ npm publish --provenance --access public --tag <dist-tag>
   ├─ Pushes the version commit + tag to main
   └─ gh release create vX.Y.Z --generate-notes
```

No human runs `npm publish` locally. If anything is off (mismatched version,
failing tests, a dirty tree, test files leaking into the tarball) the workflow
fails **before** touching the registry.

## Cutting a release

1. Open the repo's **Actions** tab → **Release** workflow → **Run
   workflow**.
2. Choose the bump:
   - **patch / minor / major** — semver increment from the current
     `package.json` version (most common),
   - **custom-version** — an exact version when you need control (e.g.
     `1.2.3-beta.1`); overrides the bump type.
3. Watch the run. On success the package appears on
   https://www.npmjs.com/package/@indy2kro/agentenv with a **Provenance**
   attestation linked back to this repo, and a matching GitHub release with
   auto-generated notes is published.

Dist-tags: a plain version (e.g. `1.0.0`) publishes to `latest`; any version
with a `-` (e.g. `1.2.3-beta.1`) publishes to `beta`. The workflow refuses to
bump to a version already on the registry, so rerunning is safe.

## Setting up auth: npm Trusted Publishing (recommended)

The `Release` workflow authenticates to the registry with **npm Trusted
Publishing** (OIDC) — no long-lived token. GitHub Actions presents a short-lived
identity for this exact workflow; the npm CLI exchanges it automatically for a
publish credential (`npm >= 11.5.1`, which the workflow upgrades to). No secrets,
no 90-day rotation, and it is npm's supported forward path:

> npm is restricting 2FA-bypass granular access tokens: they currently can't do
> account/org management, and **around January 2027 they lose direct publishing**
> entirely (they become "stage + human 2FA approval" only). Trusted publishing is
> the migration target — don't build new automation on publishing tokens.

The workflow already contains what Trusted Publishing needs
(`.github/workflows/release.yml`): `permissions.id-token: write`, a GitHub-hosted
runner (`ubuntu-latest`), `registry-url` for npmjs, an npm upgrade step, and —
crucially — **no `NODE_AUTH_TOKEN`** on the publish step (a token env var makes
npm fall back to the legacy token flow and fail with a 2FA prompt). The remaining
setup is one-time, on the npm side:

1. Sign in at [npmjs.com](https://www.npmjs.com) with the account (or
   organization) that owns the `@indy2kro` scope.
2. Open the package: https://www.npmjs.com/package/@indy2kro/agentenv →
   **Settings** → **Trusted Publisher** → **Select your publisher** →
   **GitHub Actions**.
3. Fill in the identity — all fields are **case-sensitive**:
   - **Organization or user**: `indy2kro`
   - **Repository**: `agentenv`
   - **Workflow filename**: `release.yml` (the filename only, no path)
   - **Environment name**: leave blank
   - **Allowed actions**: `npm publish`
4. **Save changes**. (npm does not verify the configuration until the first run,
   so double-check the fields above.)
5. Recommended hardening — package **Settings** → **Publishing access** →
   **"Require two-factor authentication and disallow tokens"** → **Update
   Package Settings**. Trusted publishing still works under this; it only blocks
   legacy tokens.
6. Remove the old token secret: GitHub **Settings → Secrets and variables →
   Actions → `NPM_TOKEN` → Delete**, since the token path below is dead on
   arrival.

Verify by running the **Release** workflow and watching it. If the first
run fails with **ENEEDAUTH**, the workflow isn't registered as Trusted Publisher
yet (or a field is off by a character); check that the Trusted Publisher's
**Workflow filename** is `release.yml` (an old registration pointing at
`publish.yml` will fail) and that the run was on the GitHub-hosted
`ubuntu-latest` runner.

> Note: npm allows one Trusted Publisher per package. If you ever change the
> workflow's filename, re-point the Trusted Publisher to the new name or
> publishing will fail with ENEEDAUTH.

## Legacy `NPM_TOKEN` fallback (not recommended, being deprecated)

If you ever need token-based publishing, the requirements are: granular **Read
and write** on `@indy2kro/agentenv`, **Publishing** permission only,
**Bypass 2FA checked** (without it the `npm publish` step dies with a 2FA
challenge), **Custom** expiration (write tokens cap at ~90 days), stored as the
`NPM_TOKEN` GitHub repository secret. Plan on rotation **every 2–3 months**:

1. Generate a new granular token on npm's **Access Tokens** page (keep the old
   one until the new one proves itself).
2. **Update** the `NPM_TOKEN` secret in GitHub (Settings → Secrets and variables
   → Actions) with the new value.
3. Run the **Release** workflow to confirm it publishes.
4. Revoke the old token on npm.

> Remember: this path is already half-deprecated — 2FA-bypass tokens lose direct
> publish around **January 2027** (they become stage + human approval). Treat any
> publishing token as a stopgap; Trusted Publishing above is the real solution.

## Safety notes

- **Never commit a token.** If you use the NPM_TOKEN fallback, the value must
  never reach git — if it ever does, revoke it immediately from npm's Access
  Tokens page. Prefer Trusted Publishing, which needs no token at all.
- **Version bumps come from the workflow.** Only the `Release` workflow writes
  `package.json`/`package-lock.json` versions (via `npm version`), so they can
  never drift apart. Retracting a bad publish (`npm unpublish`) is out of scope
  for the workflow and should be done deliberately.
- **Dist-tags**: `latest` is what `npm install -g @indy2kro/agentenv` users get.
  Never tag a prerelease without a `-` in the version or it will shadow the
  stable release. The workflow that enforces this is
  `.github/workflows/release.yml`.