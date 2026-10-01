# CI Credentials Inventory and Least-Privilege Review

Issue #267. Review this inventory **quarterly**, and whenever a workflow gains cloud access.

## Inventory

| ID | Credential | Type | Used by | Scope | Lifetime | Status |
|---|---|---|---|---|---|---|
| C1 | `amana-terraform-plan-<env>` | IAM role via GitHub OIDC | `terraform-plan.yml`, `terraform-drift.yml` (drift) | `ReadOnlyAccess`, plus read access to the state bucket and KMS decrypt. Explicit denies on state, lock and infrastructure writes and on SSM parameter values. | 1 h session | ✅ New (#267) |
| C2 | `amana-terraform-apply-<env>` | IAM role via GitHub OIDC | `terraform-apply.yml`, `terraform-drift.yml` (lock-test) | Read/write on its own state key, lock table access, and the service policies passed in `apply_role_policy_arns`. Denied from weakening state protections or modifying itself. | 1 h session | ✅ New (#267) |
| C3 | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | **Static IAM user keys** (repo secrets) | `backup-drill.yml` | Unknown and unreviewed. It needs to read the backup bucket. | Until rotated | ⚠️ Finding F1 |
| C4 | `TF_VAR_DB_MASTER_*`, `TF_VAR_REDIS_AUTH_TOKEN` | Repo and environment secrets | Terraform workflows | Data-plane secrets passed in as Terraform variables | Until rotated | ⚠️ Finding F3 |
| C5 | `GITHUB_TOKEN` | Ephemeral | All workflows | Each workflow declares `permissions:`, and the Terraform workflows request only `contents: read` + `id-token: write`, plus `pull-requests`/`issues: write` where they comment | Job | ✅ |

## Least-privilege checklist

Check every credential against this list during each review:

- [ ] **No long-lived keys.** Uses OIDC or short-lived STS sessions.
- [ ] **Trust is pinned.** `sub` is restricted to this repository, and apply roles are restricted to a protected GitHub *environment*, not a whole branch.
- [ ] **Separation of duties.** The identity that runs on untrusted input (PRs) cannot write anything.
- [ ] **Resource-scoped.** State access is limited to the environment's own bucket, key and table, not `*`.
- [ ] **Explicit denies on guard rails.** The credential cannot disable versioning, encryption, logging or CloudTrail, delete the lock table, or change its own role.
- [ ] **Secrets unreadable where not needed.** Plan roles cannot read SSM parameter values, and `secretsmanager:GetSecretValue` is limited to secrets Terraform must refresh.
- [ ] **Auditable.** CloudTrail captures the actions, and the session name identifies the workflow, PR or run.
- [ ] **Negative test exists** and runs on every use (C1: `terraform-plan.yml`).
- [ ] **Session duration** is 1 hour or less.

## Review results (2026-09-29)

| ID | No LLK | Trust pinned | SoD | Resource-scoped | Guard-rail denies | Secrets | Auditable | Neg. test | ≤1h |
|---|---|---|---|---|---|---|---|---|---|
| C1 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ F2 | ✅ | ✅ | ✅ |
| C2 | ✅ | ✅ | ✅ | ⚠️ depends on `apply_role_policy_arns` | ✅ | n/a | ✅ | lock-test | ✅ |
| C3 | ❌ | ❌ | ❌ | ❓ | ❌ | ❓ | partial | ❌ | ❌ |
| C4 | n/a | env-scoped | ✅ | ✅ | n/a | n/a | n/a | n/a | n/a |

### Findings

- **F1: `backup-drill.yml` uses static IAM user keys.** Replace them with an OIDC role that has `s3:GetObject`/`s3:ListBucket` on the backup bucket only, then delete the IAM user. *Owner: platform. Target: next quarter.*
- **F2: the plan role can read one secret.** `modules/secrets` manages `aws_secretsmanager_secret_version.admin_secret_key` with a placeholder value. Refreshing that resource requires `GetSecretValue`, so the plan role is allowed that action on that one ARN. Remove the version resource from Terraform (create it once with the CLI) and drop the grant. *Owner: platform.*
- **F3: database and Redis credentials pass through Terraform variables** and end up in state, where they are encrypted by KMS. Move them to `manage_master_user_password` (RDS) and a Secrets Manager–generated auth token. *Owner: platform.*
- **C2 scope:** `apply_role_policy_arns` must be customer-managed policies limited to VPC, EKS, RDS, ElastiCache and Secrets Manager, plus IAM for `amana-*` service roles only. **Do not attach `AdministratorAccess`.** Record the attached ARNs here after bootstrap.
