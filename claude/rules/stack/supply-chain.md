---
paths:
---

# Supply chain

Scope: dependencies, lockfiles, package-manager config and CI workflows in dk-coding repos (OWASP Top 10:2025 A03 and A08).

Why this file exists: the npm worm waves of September and November 2025 ("Shai-Hulud") spread through install scripts and freshly published malicious versions. Every rule below closes one of those paths.

## Adding a dependency

- Ask first (core/agent-conduct.md). The PR body justifies the package: what it replaces, how many lines it saves, maintainers, last release date, weekly downloads, licence and transitive dependency count.
- Don't add a package to save fewer than about 50 lines. Write the code in the right layer instead. Prefer the platform (Node built-ins, the Dart SDK) or a package already in the lockfile.
- Use one package per job: no second HTTP client, date library or validation library. Why: two packages for one job double the attack surface and the update load.
- Licences must be permissive (MIT, BSD, Apache-2.0, ISC) unless the owner approves another one in the PR.
- npm applications pin exact versions (`save-exact=true` in `.npmrc`, so no `^` or `~`). Dart manifests may use caret ranges because the committed `pubspec.lock` is what CI installs.
- Pin each toolchain: `.fvmrc` for Flutter, `engines` + `engine-strict=true` for Node, `required_version` for Terraform.

## Lockfiles and installs

- Commit every lockfile (`package-lock.json`, `pubspec.lock`, `.terraform.lock.hcl`). Never hand-edit one. Regenerate it with its tool in the same PR as the manifest change.
- CI installs from the lockfile only:
  - npm: `npm ci`.
  - Flutter: `flutter pub get --enforce-lockfile`. It fails if the lock is stale or a hosted package's content hash changed.
  - Terraform: `terraform init -lockfile=readonly`.
- Set `ignore-scripts=true` in `.npmrc`. If a package truly needs its install step, run it by name (`npm rebuild <pkg> --ignore-scripts=false`; plain `npm rebuild` honours `ignore-scripts` and builds nothing) from a committed script and list it in the PR. Why: install scripts were how the worm executed.
- CI runs `npm audit signatures` (registry signatures and provenance attestations) next to `npm audit --omit=dev`.

## Release-age gate

- A new version waits 7 days before adoption. Configure whichever tools the repo uses:
  - npm 11.10.0 or later: `min-release-age=7` in `.npmrc` (the value is in days).
  - Dependabot: `cooldown: { default-days: 7 }` per ecosystem.
  - Renovate: `minimumReleaseAge: "7 days"`.
- Security updates may skip the wait (Dependabot does this by design) but still go through review and CI.
- Batch updates by ecosystem and cap the number of open PRs. Each major upgrade gets its own PR, and its release notes are read. Only patch-level dev dependencies may automerge.

## CI workflows

- Pin every third-party action to a full 40-character commit SHA, with the version in a comment: `uses: actions/checkout@<sha> # v7.0.1`. Why: tags and branches are mutable.
- Cloud access from CI uses OIDC role assumption only. Grant `id-token: write` only on the job that needs it. Repository secrets never hold long-lived cloud keys.
- Set workflow-level `permissions: contents: read` and widen per job, never workflow-wide.
- Never interpolate untrusted event fields (PR title, branch name, issue or comment body) into a `run:` script. Pass them through `env:` and quote them. Why: script injection.
- A `pull_request_target` workflow never checks out or runs the PR's code.
- Secret scanning (gitleaks) runs on every PR.
- Each release build produces a CycloneDX SBOM (`npm sbom --sbom-format cyclonedx`), stored with the build artifact.
