# -----------------------------------------------------------------------------
# Terraform remote-state bootstrap (Issue #267)
#
# Creates, per environment:
#   * S3 state bucket — versioned, SSE-KMS (customer-managed key, rotation on),
#     public access fully blocked, TLS-only, server access logging enabled.
#   * S3 access-log bucket for the state bucket.
#   * DynamoDB lock table — SSE, point-in-time recovery, deletion protection.
#   * CloudTrail data-event trail on the state bucket (who read/wrote state).
#   * GitHub OIDC roles with separated duties:
#       - terraform-plan  : PR + drift workflows. Read-only. Cannot write state,
#                           cannot take locks, cannot mutate infrastructure.
#       - terraform-apply : main-branch apply only, gated by the
#                           `terraform-<env>` GitHub environment.
#
# This stack uses LOCAL state on purpose (chicken-and-egg). Run it once per
# account by an operator with admin credentials; see
# docs/terraform-remote-state.md for the bootstrap procedure. Commit nothing
# from `terraform.tfstate` — store it in the break-glass vault.
# -----------------------------------------------------------------------------

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" {
  description = "AWS region for state resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project prefix used in resource names"
  type        = string
  default     = "amana"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the CI roles (owner/name)"
  type        = string
  default     = "EziAgric/EziAgric"
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC provider (only once per AWS account)"
  type        = bool
  default     = false
}

variable "apply_role_policy_arns" {
  description = <<-EOT
    Managed policies attached to the apply role. Scope these to the services the
    environment actually manages (VPC/EKS/RDS/ElastiCache/Secrets Manager/IAM
    for service roles). Review against docs/terraform-ci-credentials.md.
  EOT
  type        = list(string)
  default     = []
}

locals {
  name_prefix  = "${var.project_name}-terraform"
  state_bucket = "${local.name_prefix}-state-${var.environment}"
  log_bucket   = "${local.name_prefix}-state-logs-${var.environment}"
  lock_table   = "${local.name_prefix}-locks-${var.environment}"
  state_key    = "infra/terraform/${var.environment}/terraform.tfstate"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform-bootstrap"
    Issue       = "267"
  }
}

data "aws_caller_identity" "current" {}

# -----------------------------------------------------------------------------
# KMS key for state encryption
# -----------------------------------------------------------------------------

resource "aws_kms_key" "state" {
  description             = "Terraform state encryption (${var.environment})"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "state" {
  name          = "alias/${local.name_prefix}-state-${var.environment}"
  target_key_id = aws_kms_key.state.key_id
}

# -----------------------------------------------------------------------------
# Access-log bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "logs" {
  bucket = local.log_bucket
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    # S3 server access logging only supports SSE-S3 on the target bucket.
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    id     = "expire-access-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_policy" "logs" {
  bucket = aws_s3_bucket.logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowS3ServerAccessLogs"
        Effect    = "Allow"
        Principal = { Service = "logging.s3.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.logs.arn}/state-access/*"
        Condition = {
          ArnLike      = { "aws:SourceArn" = "arn:aws:s3:::${local.state_bucket}" }
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      },
      {
        Sid       = "AllowCloudTrail"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = ["s3:GetBucketAcl", "s3:PutObject"]
        Resource  = [aws_s3_bucket.logs.arn, "${aws_s3_bucket.logs.arn}/cloudtrail/*"]
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.logs.arn, "${aws_s3_bucket.logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# State bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket
  tags   = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    # Required for break-glass recovery of a corrupted state file.
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_logging" "state" {
  bucket        = aws_s3_bucket.state.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "state-access/"
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "retain-noncurrent-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days           = 90
      newer_noncurrent_versions = 50
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyUnencryptedStateWrites"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.state.arn}/*"
        Condition = {
          StringNotEquals = { "s3:x-amz-server-side-encryption" = "aws:kms" }
        }
      },
      {
        # Defence in depth: even if someone widens the plan role's IAM policy,
        # the bucket itself refuses writes from it.
        Sid       = "DenyStateWritesFromPlanRole"
        Effect    = "Deny"
        Principal = { AWS = aws_iam_role.plan.arn }
        Action    = ["s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutBucketPolicy"]
        Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# Lock table
# -----------------------------------------------------------------------------

resource "aws_dynamodb_table" "locks" {
  name                        = local.lock_table
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "LockID"
  deletion_protection_enabled = true

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.state.arn
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = local.tags
}

# -----------------------------------------------------------------------------
# Access logging: CloudTrail data events on the state bucket + lock table
# -----------------------------------------------------------------------------

resource "aws_cloudtrail" "state" {
  name                          = "${local.name_prefix}-state-${var.environment}"
  s3_bucket_name                = aws_s3_bucket.logs.id
  s3_key_prefix                 = "cloudtrail"
  include_global_service_events = false
  enable_log_file_validation    = true

  advanced_event_selector {
    name = "State bucket object access"
    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::S3::Object"]
    }
    field_selector {
      field       = "resources.ARN"
      starts_with = ["${aws_s3_bucket.state.arn}/"]
    }
  }

  advanced_event_selector {
    name = "Lock table access"
    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::DynamoDB::Table"]
    }
    field_selector {
      field  = "resources.ARN"
      equals = [aws_dynamodb_table.locks.arn]
    }
  }

  depends_on = [aws_s3_bucket_policy.logs]
  tags       = local.tags
}

# -----------------------------------------------------------------------------
# GitHub OIDC + CI roles
# -----------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "github" {
  count           = var.create_github_oidc_provider ? 1 : 0
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  tags            = local.tags
}

locals {
  oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

# --- Plan role: PRs + drift detection (read-only) -----------------------------

data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:pull_request",
        "repo:${var.github_repository}:ref:refs/heads/main",
      ]
    }
  }
}

resource "aws_iam_role" "plan" {
  name                 = "${local.name_prefix}-plan-${var.environment}"
  assume_role_policy   = data.aws_iam_policy_document.plan_trust.json
  max_session_duration = 3600
  tags                 = local.tags
}

# Refresh needs Describe/Get/List across managed services. ReadOnlyAccess is
# the narrowest AWS-managed policy that covers every resource type in
# infra/terraform/modules; the explicit deny below removes secret material.
resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "plan_state" {
  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject", "s3:ListBucket", "s3:GetBucketVersioning"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
  }

  statement {
    sid       = "DecryptState"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = [aws_kms_key.state.arn]
  }

  # PR plans run with -lock=false, so the plan role never needs to write the
  # lock table. It can read it to report who holds a lock.
  statement {
    sid       = "ReadLocks"
    actions   = ["dynamodb:GetItem", "dynamodb:DescribeTable"]
    resources = [aws_dynamodb_table.locks.arn]
  }

  # `aws_secretsmanager_secret_version.admin_secret_key` (modules/secrets)
  # cannot be refreshed without reading its value. Scope that to the one
  # secret Terraform manages; see docs/terraform-ci-credentials.md (finding F2).
  statement {
    sid       = "RefreshManagedSecretVersion"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:aws:secretsmanager:${var.region}:${data.aws_caller_identity.current.account_id}:secret:${var.project_name}-${var.environment}-admin-secret-key-*"]
  }

  # ReadOnlyAccess contains no mutating actions; these explicit denies make the
  # "PR workflow cannot mutate infra" guarantee survive a future widening of
  # attached policies, and are what the negative test in terraform-plan.yml
  # asserts against.
  statement {
    sid    = "DenyStateAndLockWrites"
    effect = "Deny"
    actions = [
      "s3:PutObject", "s3:DeleteObject", "s3:DeleteObjectVersion",
      "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:UpdateItem",
      "kms:Encrypt", "kms:GenerateDataKey*", "kms:ReEncrypt*",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "DenyInfraMutation"
    effect = "Deny"
    actions = [
      "ec2:Create*", "ec2:Delete*", "ec2:Modify*", "ec2:Authorize*", "ec2:Revoke*",
      "ec2:Associate*", "ec2:Disassociate*", "ec2:Allocate*", "ec2:Release*",
      "eks:Create*", "eks:Delete*", "eks:Update*",
      "rds:Create*", "rds:Delete*", "rds:Modify*",
      "elasticache:Create*", "elasticache:Delete*", "elasticache:Modify*",
      "secretsmanager:Create*", "secretsmanager:Delete*", "secretsmanager:Put*", "secretsmanager:Update*",
      "iam:Create*", "iam:Delete*", "iam:Put*", "iam:Attach*", "iam:Detach*", "iam:Update*", "iam:PassRole",
    ]
    resources = ["*"]
  }

  # ReadOnlyAccess grants ssm:GetParameter*, which can return SecureString
  # values. Terraform here does not manage SSM parameters, so deny it.
  statement {
    sid       = "DenySsmParameterValues"
    effect    = "Deny"
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "terraform-plan-state"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan_state.json
}

# --- Apply role: main branch only, behind a protected GitHub environment ------

data "aws_iam_policy_document" "apply_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only jobs running in the protected `terraform-<env>` environment (which
    # requires reviewers and is restricted to `main`) receive this subject.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:terraform-${var.environment}"]
    }
  }
}

resource "aws_iam_role" "apply" {
  name                 = "${local.name_prefix}-apply-${var.environment}"
  assume_role_policy   = data.aws_iam_policy_document.apply_trust.json
  max_session_duration = 3600
  tags                 = local.tags
}

data "aws_iam_policy_document" "apply_state" {
  statement {
    sid       = "ReadWriteState"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket", "s3:GetBucketVersioning"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/${local.state_key}"]
  }

  statement {
    sid       = "EncryptState"
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [aws_kms_key.state.arn]
  }

  statement {
    sid       = "Locking"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = [aws_dynamodb_table.locks.arn]
  }

  # The apply role must never be able to weaken its own guard rails.
  statement {
    sid    = "ProtectStateInfrastructure"
    effect = "Deny"
    actions = [
      "s3:DeleteBucket", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy",
      "s3:PutBucketVersioning", "s3:PutEncryptionConfiguration", "s3:PutBucketLogging",
      "s3:DeleteObjectVersion",
      "dynamodb:DeleteTable", "dynamodb:UpdateTable",
      "kms:ScheduleKeyDeletion", "kms:DisableKey", "kms:PutKeyPolicy",
      "cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "cloudtrail:UpdateTrail",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "NoSelfEscalation"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = [aws_iam_role.apply.arn, aws_iam_role.plan.arn]
  }
}

resource "aws_iam_role_policy" "apply_state" {
  name   = "terraform-apply-state"
  role   = aws_iam_role.apply.id
  policy = data.aws_iam_policy_document.apply_state.json
}

resource "aws_iam_role_policy_attachment" "apply_managed" {
  for_each   = toset(var.apply_role_policy_arns)
  role       = aws_iam_role.apply.name
  policy_arn = each.value
}

# -----------------------------------------------------------------------------
# Outputs — copy into GitHub environment/repo variables
# -----------------------------------------------------------------------------

output "state_bucket" {
  value = aws_s3_bucket.state.id
}

output "lock_table" {
  value = aws_dynamodb_table.locks.name
}

output "kms_key_alias" {
  value = aws_kms_alias.state.name
}

output "plan_role_arn" {
  description = "Set as repo variable TF_PLAN_ROLE_ARN_<ENV>"
  value       = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  description = "Set as environment variable TF_APPLY_ROLE_ARN in terraform-<env>"
  value       = aws_iam_role.apply.arn
}
