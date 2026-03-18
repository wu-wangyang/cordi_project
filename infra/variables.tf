variable "project_name" {
  type        = string
  description = "Project name prefix for AWS resources."
}

variable "aws_region" {
  type        = string
  description = "AWS region for deployment."
}

variable "bucket_name" {
  type        = string
  description = "Globally unique S3 bucket name for request logging."
}

variable "cors_allow_origins" {
  type        = list(string)
  description = "Allowed CORS origins for API Gateway."
}

variable "api_key" {
  type        = string
  description = "Anthropic API key for Lambda."
  sensitive   = true
}

variable "model" {
  type        = string
  description = "Anthropic model ID used by Lambda."
}

variable "lambda_timeout" {
  type        = number
  description = "Lambda timeout in seconds."
  default     = 30
}

variable "lambda_memory_size" {
  type        = number
  description = "Lambda memory in MB."
  default     = 256
}
