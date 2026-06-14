output "elastic_ip" {
  description = "Static public IP of the API server"
  value       = aws_eip.api.public_ip
}

output "instance_id" {
  description = "EC2 instance ID"
  value       = module.ec2.id
}

output "api_url" {
  description = "API base URL — set this as FASTAPI_URL in Vercel"
  value       = "https://${aws_eip.api.public_ip}"
}

output "ssm_connect" {
  description = "Connect to the instance via SSM Session Manager (no SSH needed)"
  value       = "aws ssm start-session --target ${module.ec2.id} --region ${var.aws_region}"
}

output "swagger_ui" {
  description = "FastAPI interactive docs"
  value       = "https://${aws_eip.api.public_ip}/docs"
}

output "local_dev_user" {
  description = "IAM user for local development — generate keys with the command below"
  value       = aws_iam_user.local_dev.name
}

output "local_dev_key_command" {
  description = "Run this after apply to create an access key for local dev"
  value       = "aws iam create-access-key --user-name ${aws_iam_user.local_dev.name} --region ${var.aws_region}"
}
