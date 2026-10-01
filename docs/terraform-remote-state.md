# Terraform Remote State, Locking and CI Roles

Issue #267. This page covers how Terraform state for `infra/terraform/environments/*` is stored, locked and encrypted, and how CI is allowed to touch it.

## Summary

| Concern | Control |
|---|---|
| Remote state | S3 bucket `amana-terraform-state-<env>`, key `infra/terraform/<env>/terraform.tfstate` |
| Locking | DynamoDB table `amana-terraform-locks-<env>` (`dynamodb_table` in the backend). A second `plan`/`apply` against a locked state fails with `Error acquiring the state lock`. |
| Encryption at rest | SSE-KMS with the customer-managed key `alias/amana-terraform-state-<env>` (rotation on). The bucket policy denies any `PutObject` without `aws:kms`. The lock table is encrypted with the same key. |
| Encryption in transit | The bucket policy denies requests with `aws:SecureTransport = false`. |
| Recovery | Bucket versioning is on. Noncurrent versions are kept for 90 days, and at least the last 50 are always kept. The lock table has PITR and deletion protection. |
| Access logging | S3 server access logs are written to `amana-terraform-state-logs-<env>/state-access/`. A CloudTrail trail records data events for state objects and the lock table, with log file validation turned on. |
| CI credentials | GitHub OIDC only, with no static keys. There are two roles per environment: **plan** (read-only) and **apply** (only from the protected `terraform-<env>` environment on `main`). |
| Drift | Weekly `plan -detailed-exitcode` runs and opens a `terraform-drift` issue when it finds changes. |

All of these resources are defined in [`infra/terraform/bootstrap/main.tf`](../infra/terraform/bootstrap/main.tf).

## Bootstrap (one-time per environment)

The bootstrap stack creates the backend, so it can't store its own state in that backend. It uses **local state**, and an operator with administrator credentials runs it once per environment:

```bash
cd infra/terraform/bootstrap
terraform init
# First environment in the account also creates the GitHub OIDC provider:
terraform apply -var environment=dev -var create_github_oidc_provider=true \
  -var 'apply_role_policy_arns=["arn:aws:iam::<acct>:policy/amana-terraform-apply-dev"]'
terraform apply -var environment=staging \
  -var 'apply_role_policy_arns=["arn:aws:iam::<acct>:policy/amana-terraform-apply-staging"]'
```

Use a separate workspace or directory copy for each environment so that the local state files don't overwrite each other. Then complete these steps:

1. Store each `terraform.tfstate` from the bootstrap in the break-glass vault. **Never commit it.**
2. Set these GitHub **repository variables**: `TF_PLAN_ROLE_ARN_DEV` and `TF_PLAN_ROLE_ARN_STAGING`. Take the values from the `plan_role_arn` output.
3. Create the GitHub **environments** `terraform-dev` and `terraform-staging` with:
   - required reviewers (at least one member of the platform team)
   - deployment branches limited to `main`
   - an environment variable `TF_APPLY_ROLE_ARN`, taken from the `apply_role_arn` output
   - environment secrets `TF_VAR_DB_MASTER_USERNAME`, `TF_VAR_DB_MASTER_PASSWORD` and `TF_VAR_REDIS_AUTH_TOKEN`
4. Add the same `TF_VAR_*` values as repository secrets, because the plan and drift jobs need them.
5. Existing state: if an environment already had state in the bucket, run `terraform init -migrate-state` once. This picks up `kms_key_id`, and the next write re-encrypts the object with the KMS key.
6. Run the lock test once per environment (see below) and record the result in the verification log.

## CI workflows

| Workflow | Trigger | Role | Can mutate? |
|---|---|---|---|
| [`terraform-plan.yml`](../.github/workflows/terraform-plan.yml) | PR | plan | **No.** Runs with `-lock=false`, and the IAM policy and bucket policy deny writes. A negative test on every run checks that. |
| [`terraform-apply.yml`](../.github/workflows/terraform-apply.yml) | push to `main` or manual run | apply (environment-scoped) | Yes, after an environment reviewer approves. Applies are serialized per environment with `-lock-timeout=5m`. |
| [`terraform-drift.yml`](../.github/workflows/terraform-drift.yml) `drift` | weekly or manual run | plan | No |
| [`terraform-drift.yml`](../.github/workflows/terraform-drift.yml) `lock-test` | manual run | apply (environment-scoped) | Writes only a synthetic lock item, and removes it afterwards |

### Negative test: PRs cannot mutate infrastructure

After every PR plan, `terraform-plan.yml` uses the plan role to try three writes:

- write an object to the state bucket
- write an item to the lock table
- run `ec2:CreateTags` on the VPC

If any of these succeeds, the job fails. The bucket policy statement `DenyStateWritesFromPlanRole` also blocks state writes even if the plan role's IAM policy is widened later by mistake.

### Lock test: concurrent applies are blocked

Run **Actions → Terraform Drift Detection → Run workflow** with `mode = lock-test` and choose an environment. [`scripts/terraform-lock-test.sh`](../scripts/terraform-lock-test.sh) does the following:

1. It writes a lock item exactly as a running `apply` would. This is a conditional put, so it refuses to run if a real lock already exists.
2. It runs `terraform plan -lock=true -lock-timeout=10s` and requires it to fail with `Error acquiring the state lock`.
3. It always removes its own lock item, conditional on its unique ID.

## Drift triage

The weekly drift job opens or updates the issue **"Terraform drift detected: \<env\>"** with the label `terraform-drift`. The platform on-call engineer triages it within one business week:

1. Identify the drifted resources from the plan excerpt in the issue.
2. Use CloudTrail to find out who changed each resource and why.
3. Decide how to resolve it:
   - **Keep the change**: codify it in Terraform in a PR, and the PR plan should show no changes.
   - **Discard the change**: run `terraform-apply.yml` for the environment to restore the declared state.
   - **Accept temporarily**: document the reason in the issue and set a follow-up date.
4. Close the issue and record the outcome.

## Verification log

| Date | Env | Check | Result | By |
|---|---|---|---|---|
| _pending_ | dev | lock-test | — | — |
| _pending_ | staging | lock-test | — | — |
| _pending_ | dev/staging | PR negative test | — | — |
| _pending_ | dev/staging | S3 access logs + CloudTrail data events present | — | — |
| _pending_ | dev/staging | `aws s3api head-object` shows `ServerSideEncryption: aws:kms` on state | — | — |

See also [`terraform-ci-credentials.md`](./terraform-ci-credentials.md) for the credentials inventory, and [`runbooks/terraform-state-recovery.md`](./runbooks/terraform-state-recovery.md) for the break-glass procedure.
