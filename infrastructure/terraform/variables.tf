variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "region" {
  description = "Azure region for resource deployment"
  type        = string
  default     = "eastus"
}

variable "project_name" {
  description = "Project identifier used in resource naming"
  type        = string
  default     = "tres-crm"
}

variable "mongo_tier" {
  description = "MongoDB Atlas instance size (M10, M20, M30, etc.)"
  type        = string
  default     = "M10"

  validation {
    condition     = can(regex("^M[0-9]+$", var.mongo_tier))
    error_message = "MongoDB tier must match pattern M<number> (e.g., M10, M20)."
  }
}

variable "mongodb_atlas_org_id" {
  description = "MongoDB Atlas organization ID"
  type        = string
  sensitive   = true
}

variable "mongodb_provider_name" {
  description = "Cloud provider for MongoDB Atlas (AZURE, AWS, GCP)"
  type        = string
  default     = "AZURE"
}

variable "mongodb_region" {
  description = "MongoDB Atlas region name"
  type        = string
  default     = "US_EAST_2"
}

variable "aks_node_vm_size" {
  description = "VM size for AKS default node pool"
  type        = string
  default     = "Standard_D2s_v3"
}

variable "nats_vm_size" {
  description = "VM size for NATS server"
  type        = string
  default     = "Standard_B2s"
}

variable "nats_ssh_public_key" {
  description = "SSH public key for NATS VM admin access"
  type        = string
}

variable "nats_version" {
  description = "NATS server version to install"
  type        = string
  default     = "2.10.7"
}
