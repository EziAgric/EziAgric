# Runbook: Terraform Locked or Corrupted State (Break-Glass)

**Owner:** platform on-call · **Related:** [`terraform-remote-state.md`](../terraform-remote-state.md), Issue #267

Use this runbook when:

- `terraform plan` or `terraform apply` fails with `Error acquiring the state lock` and the lock does not clear by itself, or
- the state file is corrupted, truncated or was overwritten by a bad apply.

> **Never** run `terraform force-unlock` from CI, and never run it while someone else might be applying. Two concurrent applies against one state is exactly the corruption this runbook exists to repair.

## 0. Declare

1. Post in `#infra-oncall`: `BREAK-GLASS: terraform state <env> — <locked|corrupt> — <your name>`.
2. Freeze applies: in GitHub, open **Settings → Environments → terraform-<env>** and add yourself as the only required reviewer, or disable the deployment branch rule. `terraform-apply.yml` can then no longer start.

## 1. Stuck lock

1. **Find the lock holder:**

   ```bash
   aws dynamodb get-item --table-name amana-terraform-locks-<env> \
     --key '{"LockID":{"S":"amana-terraform-state-<env>/infra/terraform/<env>/terraform.tfstate"}}' \
     --query 'Item.Info.S' --output text | jq .
   ```

   Note the `ID`, `Who`, `Operation` and `Created` fields.
2. **Confirm that nobody is still running:**
   - If `Who` is a CI runner, check that the run shown in **Actions → Terraform Apply** has finished or was cancelled.
   - If `Who` is a person, contact them directly. Do not continue until they confirm their process has exited.
   - A lock less than 30 minutes old is probably a live apply. Wait.
3. **Release the lock.** Do this only with the lock ID from step 1, and use the break-glass role (see §3):

   ```bash
   cd infra/terraform/environments/<env>
   terraform init -input=false
   terraform force-unlock <LOCK_ID>
   ```

4. Run `terraform plan`. If the interrupted apply left partial changes, the plan shows them. Reconcile them through a normal PR and apply.

## 2. Corrupted or bad state

The state bucket is versioned, so you can restore any earlier version.

1. **List the versions:**

   ```bash
   aws s3api list-object-versions --bucket amana-terraform-state-<env> \
     --prefix infra/terraform/<env>/terraform.tfstate \
     --query 'Versions[].{v:VersionId,t:LastModified,latest:IsLatest,size:Size}' --output table
   ```

2. **Download the last good version** and inspect it:

   ```bash
   aws s3api get-object --bucket amana-terraform-state-<env> \
     --key infra/terraform/<env>/terraform.tfstate --version-id <VERSION_ID> good.tfstate
   jq '.serial, .lineage, (.resources | length)' good.tfstate
   ```

3. **Take the lock** so nobody else writes while you restore. The simplest way is to run `terraform plan -lock=true` in a second terminal and leave it waiting at the prompt, or you can hold the synthetic lock that `scripts/terraform-lock-test.sh` uses.
4. **Restore the version:**
   - `terraform state push` rejects a lower serial. Bump `.serial` above the current serial first, and keep `.lineage` unchanged:

     ```bash
     CUR=$(terraform state pull | jq .serial)
     jq ".serial = $((CUR + 1))" good.tfstate > restore.tfstate
     terraform state push restore.tfstate
     ```

5. Run `terraform plan`. It should show only the real difference between the restored state and the live infrastructure. Reconcile that difference with `terraform import` or through a normal PR.
6. If the lock table itself is damaged, restore it with DynamoDB point-in-time recovery (PITR) to a new table, then point `dynamodb_table` at it in a PR.

## 3. Break-glass access

The CI roles can't perform this procedure:

- The plan role can't write anything.
- The apply role can't delete object versions or change bucket settings.

Use the **break-glass** path instead:

- Sign in to the admin account through SSO with the `AmanaBreakGlassAdmin` permission set. MFA is required, and sessions last at most 1 hour.
- Every action is recorded by the CloudTrail data-event trail on the state bucket and lock table.
- Take a snapshot before you change anything: `terraform state pull > pre-recovery-$(date +%s).tfstate`. Store the snapshot in the incident folder. Never commit it.

## 4. Close out

1. Remove the apply freeze from §0.
2. Run the lock test once: **Terraform Drift Detection → lock-test**.
3. File a postmortem using [`postmortem-template.md`](./postmortem-template.md), and link the CloudTrail events.
4. Add a row to the verification log in `terraform-remote-state.md`.
