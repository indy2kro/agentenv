# Releasing `@indy2kro/agentenv`

How the package gets to npm, how to cut a release, and how to connect the npm
account so GitHub Actions can publish it (Trusted Publishing / OIDC — no token).

> Short version: publishing is **tag-driven and fully automated**. Bump the
> version in `cmd/agentenv/package.json`, commit, then push a `v<version>` git
> tag. GitHub Actions runs the `Publish` workflow (`.github/workflows/publish.yml`)
> which gates the tree, checks the tarball, and runs `npm publish --provenance`
> via Trusted Publishing (OIDC). Design/decisions:
> [`docs/plans/2026-09-15-publish-workflow.md`](../plans/2026-09-15-publish-workflow.md).

## What "publishing" looks like

```text
push v1.4.2 tag ──► Publish workflow (ubuntu-latest, Node 24)
                     ├─ Verifies tag == package.json version   (else fails)
                     ├─ Gate: build, lint, format:check, test, smoke
                     ├─ Verifies working tree is clean
                     ├─ npm pack --dry-run content check       (dist/, README, LICENSE)
                     ├─ Dist-tag: "latest" unless version has a "-" → "beta"
                     └─ npm publish --provenance --access public --tag <tag>
```

No human runs `npm publish` locally — a maintainer only ever creates the tag.
If anything is off (mismatched tag, failing tests, a dirty tree, test files
leaking into the tarball) the workflow fails **before** touching the registry.

## Cutting a release

1. Decide the version. Follow [semver](https://semver.org/). A `-` in the
   version (e.g. `0.2.0-beta.1`) publishes to the `beta` dist-tag; a plain
   version (e.g. `1.0.0`) publishes to `latest`.
2. Bump `version` in [`cmd/agentenv/package.json`](../../cmd/agentenv/package.json)
   (and `cmd/agentenv/package-lock.json` — run `npm install` in `cmd/agentenv`
   after editing, or `npm version X.Y.Z` which updates both).
3. Make sure the tree is green and clean locally:

   ```sh
   cd cmd/agentenv
   npm run lint && npm run format:check && npm test && npm run smoke
   git diff --exit-code
   ```

4. Commit the version bump:

   ```sh
   git add cmd/agentenv/package.json cmd/agentenv/package-lock.json
   git commit -m "chore: release vX.Y.Z"
   git push origin main
   ```

5. Create and push the tag — the tag name must be `v<version>` exactly:

   ```sh
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

6. Watch the `Publish` workflow in the repo's **Actions** tab. On success the
   package appears on https://www.npmjs.com/package/@indy2kro/agentenv with a
   **Provenance** attestation linked back to this repo.

## Setting up auth: npm Trusted Publishing (recommended)

The `Publish` workflow authenticates to the registry with **npm Trusted
Publishing** (OIDC) — no long-lived token. GitHub Actions presents a short-lived
identity for this exact workflow; the npm CLI exchanges it automatically for a
publish credential (`npm >= 11.5.1`, which the workflow upgrades to). No secrets,
no 90-day rotation, and it is npm's supported forward path:

> npm is restricting 2FA-bypass granular access tokens: they currently can't do
> account/org management, and **around January 2027 they lose direct publishing**
> entirely (they become "stage + human 2FA approval" only). Trusted publishing is
> the migration target — don't build new automation on publishing tokens.

The workflow already contains what Trusted Publishing needs
(`.github/workflows/publish.yml`): `permissions.id-token: write`, a GitHub-hosted
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
   - **Workflow filename**: `publish.yml` (the filename only, no path)
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

Verify by pushing a `v*` tag and watching the `Publish` workflow. If the first
run fails with **ENEEDAUTH**, the workflow isn't registered as Trusted Publisher
yet (or a field is off by a character); re-check step 3 and that the run was on
the GitHub-hosted `ubuntu-latest` runner.

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
3. Push a throwaway `v*` tag to confirm it publishes.
4. Revoke the old token on npm.

> Remember: this path is already half-deprecated — 2FA-bypass tokens lose direct
> publish around **January 2027** (they become stage + human approval). Treat any
> publishing token as a stopgap; Trusted Publishing above is the real solution.

## Safety notes

- **Never commit a token.** If you use the NPM_TOKEN fallback, the value must
  never reach git — if it ever does, revoke it immediately from npm's Access
  Tokens page. Prefer Trusted Publishing, which needs no token at all.
- **Publishing is the tag.** Branch pushes never run `npm publish`. Retracting
  a bad publish (`npm unpublish`) is out of scope for the workflow and should
  be done deliberately.
- **Dist-tags**: `latest` is what `npm install -g @indy2kro/agentenv` users get.
  Never tag a prerelease without a `-` in the version or it will shadow the
  stable release. See also
  [`docs/plans/2026-09-15-publish-workflow.md`](../plans/2026-09-15-publish-workflow.md).