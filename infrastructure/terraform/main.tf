terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.14"
    }
  }

  backend "azurerm" {
    resource_group_name  = "tres-crm-tfstate"
    storage_account_name = "trescrmtfstate"
    container_name       = "tfstate"
    key                  = "terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
}

provider "mongodbatlas" {
  # Set via MONGODB_ATLAS_PUBLIC_KEY and MONGODB_ATLAS_PRIVATE_KEY env vars
}

# ---------------------------------------------------------------------------
# Resource Group
# ---------------------------------------------------------------------------
resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project_name}-${var.environment}"
  location = var.region

  tags = local.common_tags
}

locals {
  common_tags = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# ---------------------------------------------------------------------------
# MongoDB Atlas Cluster
# ---------------------------------------------------------------------------
resource "mongodbatlas_project" "main" {
  name   = "${var.project_name}-${var.environment}"
  org_id = var.mongodb_atlas_org_id
}

resource "mongodbatlas_cluster" "main" {
  project_id = mongodbatlas_project.main.id
  name       = "${var.project_name}-${var.environment}"

  provider_name               = var.mongodb_provider_name
  provider_region_name        = var.mongodb_region
  provider_instance_size_name = var.mongo_tier

  cluster_type = "REPLICASET"

  replication_specs {
    num_shards = 1
    regions_config {
      region_name     = var.mongodb_region
      electable_nodes = 3
      priority        = 7
      read_only_nodes = 0
    }
  }

  auto_scaling_disk_gb_enabled = true

  mongo_db_major_version = "7.0"

  backup_enabled                 = var.environment == "production" ? true : false
  pit_enabled                    = var.environment == "production" ? true : false
  provider_backup_enabled        = var.environment == "production" ? true : false
  provider_auto_scaling_compute_min_instance_size = var.environment == "production" ? "M10" : null
  provider_auto_scaling_compute_max_instance_size = var.environment == "production" ? "M30" : null
}

resource "mongodbatlas_database_user" "app" {
  username           = "${var.project_name}-app-${var.environment}"
  password           = random_password.mongodb_password.result
  project_id         = mongodbatlas_project.main.id
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = var.project_name
  }

  scopes {
    name = mongodbatlas_cluster.main.name
    type = "CLUSTER"
  }
}

resource "random_password" "mongodb_password" {
  length  = 32
  special = false
}

resource "mongodbatlas_project_ip_access_list" "aks" {
  project_id = mongodbatlas_project.main.id
  cidr_block = azurerm_kubernetes_cluster.main.network_profile[0].pod_cidr
  comment    = "AKS pod CIDR for ${var.environment}"
}

# ---------------------------------------------------------------------------
# Azure Container Registry
# ---------------------------------------------------------------------------
resource "azurerm_container_registry" "main" {
  name                = replace("${var.project_name}${var.environment}acr", "-", "")
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.environment == "production" ? "Premium" : "Basic"
  admin_enabled       = false

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# AKS Cluster
# ---------------------------------------------------------------------------
resource "azurerm_kubernetes_cluster" "main" {
  name                = "aks-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "${var.project_name}-${var.environment}"

  default_node_pool {
    name                = "default"
    node_count          = var.environment == "production" ? 3 : 1
    vm_size             = var.aks_node_vm_size
    enable_auto_scaling = var.environment == "production" ? true : false
    min_count           = var.environment == "production" ? 2 : null
    max_count           = var.environment == "production" ? 6 : null

    vnet_subnet_id = azurerm_subnet.aks.id
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "azure"
    network_policy    = "calico"
    load_balancer_sku = "standard"
  }

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }

  tags = local.common_tags
}

# Grant AKS access to ACR
resource "azurerm_role_assignment" "aks_acr_pull" {
  principal_id                     = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
  role_definition_name             = "AcrPull"
  scope                            = azurerm_container_registry.main.id
  skip_service_principal_aad_check = true
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------
resource "azurerm_virtual_network" "main" {
  name                = "vnet-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.0.0.0/16"]

  tags = local.common_tags
}

resource "azurerm_subnet" "aks" {
  name                 = "snet-aks"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.0.0/20"]
}

resource "azurerm_subnet" "nats" {
  name                 = "snet-nats"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.16.0/24"]
}

# ---------------------------------------------------------------------------
# NATS Server (Azure VM)
# ---------------------------------------------------------------------------
resource "azurerm_network_interface" "nats" {
  name                = "nic-nats-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.nats.id
    private_ip_address_allocation = "Dynamic"
  }

  tags = local.common_tags
}

resource "azurerm_linux_virtual_machine" "nats" {
  name                = "vm-nats-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  size                = var.nats_vm_size
  admin_username      = "natsadmin"

  network_interface_ids = [azurerm_network_interface.nats.id]

  admin_ssh_key {
    username   = "natsadmin"
    public_key = var.nats_ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
    disk_size_gb         = 30
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  custom_data = base64encode(templatefile("${path.module}/templates/nats-cloud-init.yaml", {
    nats_version   = var.nats_version
    nats_port      = 4222
    cluster_name   = "${var.project_name}-${var.environment}"
    jetstream_enabled = true
  }))

  tags = local.common_tags
}

resource "azurerm_network_security_group" "nats" {
  name                = "nsg-nats-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  security_rule {
    name                       = "AllowNATSFromAKS"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "4222"
    source_address_prefix      = "10.0.0.0/20"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = local.common_tags
}

resource "azurerm_subnet_network_security_group_association" "nats" {
  subnet_id                 = azurerm_subnet.nats.id
  network_security_group_id = azurerm_network_security_group.nats.id
}

# ---------------------------------------------------------------------------
# Log Analytics
# ---------------------------------------------------------------------------
resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${var.project_name}-${var.environment}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = var.environment == "production" ? 90 : 30

  tags = local.common_tags
}
