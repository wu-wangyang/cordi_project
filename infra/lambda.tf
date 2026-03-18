data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/lambda"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_lambda_function" "summariser" {
  function_name = "${var.project_name}-summariser"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "python3.12"
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {
    variables = {
      LOG_BUCKET_NAME   = aws_s3_bucket.logs.bucket
      GEMINI_API_KEY = var.anthropic_api_key
      GEMINI_MODEL   = var.anthropic_model
      CORS_ORIGIN       = var.cors_allow_origins[0]
    }
  }
}
