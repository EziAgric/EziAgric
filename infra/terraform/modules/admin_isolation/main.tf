# Admin Isolation Module — VPC Security Group Policy for Internal Admin Access

variable "project_name" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "trusted_admin_cidrs" {
  description = "Trusted IP CIDR ranges permitted to reach admin endpoints"
  type        = list(string)
  default     = ["10.0.0.0/16", "172.16.0.0/12"]
}

resource "aws_security_group" "admin_access_sg" {
  name        = "${var.project_name}-${var.environment}-admin-sg"
  description = "Restricts admin endpoints access to trusted management networks"
  vpc_id      = var.vpc_id

  ingress {
    description = "Allow HTTPS admin access from trusted internal networks"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.trusted_admin_cidrs
  }

  ingress {
    description = "Allow direct backend port access from management VPN"
    from_port   = 4000
    to_port     = 4000
    protocol    = "tcp"
    cidr_blocks = var.trusted_admin_cidrs
  }

  egress {
    description = "Allow outbound traffic to VPC"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-admin-sg"
    Environment = var.environment
    Policy      = "AdminEndpointIsolation"
  }
}

output "admin_security_group_id" {
  description = "ID of the admin isolation security group"
  value       = aws_security_group.admin_access_sg.id
}
