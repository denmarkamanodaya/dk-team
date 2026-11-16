# Template — Terraform versioned module

```
terraform/modules/<name-kebab>/
  v1/
    main.tf
    variables.tf
    outputs.tf
    versions.tf
    README.md        hand-written head + terraform-docs block
    tests/
      v1.tftest.hcl
```

`versions.tf`:

```hcl
terraform {
  required_version = "~> 1.13"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
```

`variables.tf` (every variable: description, type, validation when finite, nullable = false):

```hcl
variable "name" {
  description = "Fully prefixed resource name, e.g. <app>-dev-sync. Built by the caller from local.name_prefix."
  type        = string
  nullable    = false
  validation {
    condition     = can(regex("^[a-z0-9-]{3,64}$", var.name))
    error_message = "name must be 3–64 chars of [a-z0-9-]."
  }
}
```

`README.md` head (above the generated block):

```
# <name> v1
Since <yyyy-mm-dd> · first version
Purpose: <one sentence>.
Owns: <resources>. Caller responsibilities: <triggers, permissions, integrations the module deliberately does not create>.
Rollback: n/a — first version.

<!-- BEGIN_TF_DOCS -->
<!-- END_TF_DOCS -->
```

`tests/v1.tftest.hcl` (plan mode, no AWS):

```hcl
variables { name = "app-dev-sync" }
run "name_is_prefixed" {
  command = plan
  assert {
    condition     = startswith(aws_lambda_function.this.function_name, "app-dev-")
    error_message = "function name must carry the app-stage prefix"
  }
}
```

Caller (in a stack):

```hcl
module "sync_fn" {
  source = "../../modules/lambda-fn/v2"   # bump = change this line + add moved {} blocks if addresses change
  name   = "${local.name_prefix}-sync"
  # …
}
```

Bumping to v2 = copy `v1/` to `v2/`, change behaviour there, update the README head (`Supersedes: v1 · Change · Rollback`), add `tests/v2.tftest.hcl`, switch the caller's `source`, add `moved {}` blocks for any address change, read the plan in full.
