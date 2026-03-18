output "api_base_url" {
  description = "Base invoke URL for the HTTP API."
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}

output "lambda_name" {
  description = "Lambda function name."
  value       = aws_lambda_function.summariser.function_name
}

output "log_bucket_name" {
  description = "S3 bucket name used for request logging."
  value       = aws_s3_bucket.logs.bucket
}
