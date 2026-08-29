output "mongodb_connection_string" {
  description = "MongoDB Atlas connection string (SRV format)"
  value       = mongodbatlas_cluster.main.connection_strings[0].standard_srv
  sensitive   = true
}

output "mongodb_username" {
  description = "MongoDB application database user"
  value       = mongodbatlas_database_user.app.username
}

output "mongodb_password" {
  description = "MongoDB application database password"
  value       = random_password.mongodb_password.result
  sensitive   = true
}

output "acr_login_server" {
  description = "Azure Container Registry login server URL"
  value       = azurerm_container_registry.main.login_server
}

output "acr_id" {
  description = "Azure Container Registry resource ID"
  value       = azurerm_container_registry.main.id
}

output "aks_cluster_name" {
  description = "AKS cluster name"
  value       = azurerm_kubernetes_cluster.main.name
}

output "aks_kube_config" {
  description = "AKS kubeconfig for kubectl access"
  value       = azurerm_kubernetes_cluster.main.kube_config_raw
  sensitive   = true
}

output "aks_cluster_fqdn" {
  description = "AKS cluster fully qualified domain name"
  value       = azurerm_kubernetes_cluster.main.fqdn
}

output "nats_private_ip" {
  description = "NATS server private IP address"
  value       = azurerm_network_interface.nats.private_ip_address
}

output "nats_connection_url" {
  description = "NATS connection URL for application configuration"
  value       = "nats://${azurerm_network_interface.nats.private_ip_address}:4222"
}

output "resource_group_name" {
  description = "Resource group name"
  value       = azurerm_resource_group.main.name
}

output "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID for monitoring"
  value       = azurerm_log_analytics_workspace.main.id
}
