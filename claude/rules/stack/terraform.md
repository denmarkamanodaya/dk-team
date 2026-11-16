---
paths:
  - "**/terraform/**/*.tf"
  - "**/terraform/**/*.tftest.hcl"
---

# Terraform

Scope: Terraform in dk-coding repos only. In older repos, their own CLAUDE.md governs.

Modules are adapters, stacks are composition roots (core/architecture-hexagonal.md). Naming and `variable`/`output` documentation: stack/code-style.md. Secrets and IAM principles: stack/security.md.

## Layout and stage selection (the stage is picked by one wrapper script, never by hand-typed flags)

Owner ruling 2026-10-19 (cliplyfs R8): the rule follows the per-stage tfvars + `tf.sh` layout. This replaces the earlier `live/<stage>/<stack>/` literal-root rule (audit 2026-10-04 D7).

- `modules/<name>/v<N>/` (one responsibility per module) · `stacks/<stack>/` (composes modules by feature) · `roots/<stack>/` (one root per stack, shared by every stage) · `env/<stage>.tfvars`, `env/<stage>.<stack>.tfvars`, `env/<stage>.<stack>.backend.hcl` (the only place stage values live: stage, account id, region, feature switches) · `bootstrap/` (state bucket, OIDC roles, permission boundary, SCPs; applied by a human).
- Terraform is run **only** through `tf.sh <stage> <stack> <command>`. It pairs the stage's tfvars and backend file. It refuses when any `TF_VAR_*` is set and when `aws sts get-caller-identity` is not the stage's account (exit 65). Never call `terraform` directly against a stage, and never pass `-var`, `-var-file`, `-backend-config` or `-reconfigure` by hand. Offline checks (`init -backend=false`, `validate`, `test`) may run directly. Why: one script decides which state and account a command touches; a hand-typed flag is how a stage gets destroyed by mistake.
- No `terraform.tfvars` and no `*.auto.tfvars` anywhere. The env files are reviewed like code.

## The agent never applies

- Never run `terraform apply` or `terraform destroy`. Produce a saved plan (`plan -out=<file>`), run the plan guard, show the summary, and stop. CI applies dev on a `develop` push and prod on manual dispatch.
- A `bootstrap/` apply or any IAM/permission change outside the pipeline needs the owner's yes on its plan first (core/agent-conduct.md).

## Gates (never add an inline ignore without a reason)

- `required_version = "~> 1.x"` (current minor at project start); providers pinned `~> major.minor`; `.terraform.lock.hcl` committed.
- State: S3 backend with `use_lockfile = true` (no DynamoDB lock table); bucket versioned, SSE-KMS, public access blocked.
- `terraform fmt` (stack/code-style.md); `terraform validate` per root; `tflint` + `tflint-ruleset-aws` (naming, documented variables and outputs, unused declarations).
- `trivy config` fails on HIGH/CRITICAL; an exception is inline `#trivy:ignore:<id> <reason>`.
- `terraform-docs --output-check` per module version; `terraform test` with `tests/*.tftest.hcl` per module version in plan mode; `check:versions` covers `modules/<name>/v<N>/`.
- Plan guard: pipe `terraform show -json <plan>` through `tf-plan-guard.jq` in a mode where an empty or failed `show` fails (`jq -n`). It blocks delete/replace of tables, buckets, state, zones and KMS keys, and PITR or deletion-protection flips. A deliberate destructive change carries an allow entry in the same PR. Apply only the saved plan.

## Module versions

- A module version is the directory `modules/<name>/v<N>/` holding `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `README.md`, `tests/`. Callers pin the path; switching versions is a one-line stack change whose plan you read in full.
- An address change between module versions ships `moved {}` blocks in the same PR; the plan guard enforces this for protected resources.
- Every `aws_lambda_function` has `publish = true` and a `live` alias; routes and schedulers target the alias, so a bad bundle rolls back by re-pointing it.
- Terraform core and provider upgrades are their own PR with a no-change plan.

## Resource rules

- Stacks: flat `*.tf` by feature plus `locals.tf`, `providers.tf`, `variables.tf`, `outputs.tf`.
- Block order: `count`/`for_each`, required arguments, optional arguments, nested blocks, `tags`, then `lifecycle` and `depends_on`.
- Prefer `for_each`; use `count` only as `var.enable_x ? 1 : 0`.
- No literal names, ARNs, account ids or regions outside the stage env files (`env/<stage>.*.tfvars`, `*.backend.hcl`); AWS names come from `local.name_prefix` (stack/code-style.md).
- `default_tags` carry `Project`, `Stage`, `Stack`, `ManagedBy = "terraform"`, `Repo`; resources add only `Name`.
- Secrets live in SSM `SecureString`; Terraform passes parameter names only; use `ephemeral` or write-only arguments when a value must pass through.
- One execution role per Lambda with enumerated actions; no `*` resource unless AWS requires it, with a comment citing the doc.
- Tables get `deletion_protection_enabled` and PITR; tables, buckets, zones and KMS keys get `prevent_destroy`; buckets are versioned with noncurrent-version expiry.
- `moved {}` and `import {}` blocks go in the PR, never CLI-only state surgery. Use `precondition` and `check {}` for cross-resource invariants.
- Modules are single-purpose: they own a resource plus its logs and policies, never its triggers; take values, not resource objects; use local path sources only.
- Feature switches default to the prod-safe value; a stage turns one on in its `env/<stage>.<stack>.tfvars`. A develop-to-main promotion never changes prod by itself.

## CI order

`fmt -check` -> `tflint` -> `trivy config` -> `terraform-docs --output-check` -> `terraform test` -> `check:versions`, `check:env-scope`, `check:iam-scope` -> `build:lambdas` (bundles must exist before `validate` reads their paths) -> per stage and stack `tf.sh <stage> <stack> init` -> `validate` -> `plan -out` -> plan guard -> apply the saved plan (CI only).
