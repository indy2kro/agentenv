# Releasing `@indy2kro/agentenv`

How the package gets to npm, how to cut a release, and how to create the npm
token that lets GitHub Actions publish it.

> Short version: publishing is **tag-driven and fully automated**. Bump the
> version in `cmd/agentenv/package.json`, commit, then push a `v<version>` git
> tag. GitHub Actions runs the `Publish` workflow (`.github/workflows/publish.yml`)
> which gates the tree, checks the tarball, and runs `npm publish --provenance`.
> Design/decisions: [`docs/plans/2026-09-15-publish-workflow.md`](../plans/2026-09-15-publish-workflow.md).

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

## Creating the npm access token (`NPM_TOKEN`)

The workflow authenticates to the registry with a token stored as a GitHub
**repository secret** named `NPM_TOKEN`. It needs `publish` scope over the
`@indy2kro` scope — i.e. it must come from the npm account (or organization
member) that owns `indy2kro` on the registry.

> Since the November 2025 npm security update, only **granular access tokens**
> exist (classic tokens are revoked), and **write-capable tokens have a maximum
> lifetime of 90 days** (default just 7 days). Read-only tokens are unlimited.
> A publishing token therefore **must be rotated roughly every three months** —
> see [Rotating the token](#rotating-the-token) below.

1. Sign in at [npmjs.com](https://www.npmjs.com) with that account.
2. Open **Access Tokens**: avatar menu → "Access Tokens", or go directly to
   `https://www.npmjs.com/settings/<your-username>/tokens` (for an org scope,
   create it under the org that owns `@indy2kro`).
3. Click **Generate New Token** → **Granular Access Token**.
4. Configure it to be exactly as scoped as npm allows:
   - **Name**: `GitHub Actions - agentenv publish`
   - **Packages & scopes**: **Read and write** on `@indy2kro/agentenv`
     (add it individually, e.g. `indy2kro/agentenv` → `Read and write`).
   - Leave only the **Publishing** permission active.
   - **Expiration**: select **Custom** and pick the furthest allowed date. npm
     caps write tokens at **90 days**, so expect the longest option to be the
     calendar's 90-day limit — planning the rotation is part of the job.
   - **Bypass 2FA**: check it. CI publishes non-interactively and cannot answer
     a one-time-password prompt; without this, the `npm publish` step fails
     with a 2FA challenge. (Checked state is fine: GitHub Actions can still
     publish but cannot do account/org governance operations.)
5. **Copy the token now** — npm shows it once. Treat it like a password; store
   it in your password manager. Never add it to `.npmrc`, `.env`, or commit it.
6. Add the secret to GitHub:
   1. Open the repo: **Settings → Secrets and variables → Actions**.
   2. **New repository secret**.
   3. Name: `NPM_TOKEN`.
   4. Value: paste the token you copied in step 5.
   5. **Add secret**. (Admin access to the repo is required.)
7. Verify: push a `v*` test tag (or re-trigger the `Publish` workflow via
   **Actions → Publish → Run workflow** with a branch ref) and confirm the
   `npm publish` step succeeds.

## Rotating the token

Publishing tokens expire (currently at most 90 days). Treat rotation as a
calendar reminder item, roughly **every 2–3 months**:

1. Generate a new granular token exactly as above (steps 3–5). Keep the old one
   alive until the new one has proven itself — npm lets you have several.
2. In GitHub, edit the `NPM_TOKEN` secret (Settings → Secrets and variables →
   Actions → `NPM_TOKEN` → **Update**) and paste the new value.
3. Re-run the `Publish` workflow or do a throwaway `v*` tag push to confirm the
   new token works.
4. Revoke the old token on npm's Access Tokens page once the new one is
   confirmed publishing.

> Secrets, once written, can only be replaced or deleted — GitHub will not show
> you the value again, which is why the old token is kept until the new one is
> verified.

## Safety notes

- **Never commit the token.** The repo's `.gitignore` already excludes
  `*.log` and build artifacts, but the token itself must never reach git — if
  it ever does, revoke it immediately from npm's Access Tokens page and rotate
  the secret.
- **Publishing is the tag.** Branch pushes never run `npm publish`. Retracting
  a bad publish (`npm unpublish`) is out of scope for the workflow and should
  be done deliberately.
- **Dist-tags**: `latest` is what `npm install -g @indy2kro/agentenv` users get.
  Never tag a prerelease without a `-` in the version or it will shadow the
  stable release. See also
  [`docs/plans/2026-09-15-publish-workflow.md`](../plans/2026-09-15-publish-workflow.md).