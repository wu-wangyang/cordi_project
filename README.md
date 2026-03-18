# CORDi Technical Assessment — AI Meeting Notes Summariser

This repository contains a complete starter implementation for the CORDi full-stack technical assessment.

It includes:
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS
- **Backend:** AWS Lambda (Python 3.12) behind API Gateway
- **Storage:** S3 logging of every request/response pair
- **Infrastructure as Code:** Terraform with `dev.tfvars`

## What the app does
A user pastes raw meeting notes into a text area, clicks **Summarise Notes**, and receives:
- A 2–3 sentence summary
- A list of key decisions
- A list of action items

The Lambda also writes a JSON log to S3 containing:
- raw input
- AI output
- parsed output
- timestamp

---

## Project structure

```text
.
├── backend/
│   └── lambda/
│       └── index.py
├── docs/
│   ├── ai-usage.md
│   └── demo-checklist.md
├── frontend/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── .env.local.example
│   ├── next.config.ts
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── infra/
│   ├── api_gateway.tf
│   ├── dev.tfvars
│   ├── iam.tf
│   ├── lambda.tf
│   ├── outputs.tf
│   ├── providers.tf
│   ├── s3.tf
│   ├── terraform-plan.txt
│   └── variables.tf
└── README.md
```

---

## 1. Prerequisites

Make sure you have the following installed locally:
- Node.js 20+
- npm 10+
- Terraform 1.6+
- AWS CLI configured with credentials

sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
sudo dnf -y install terraform
terraform version

---

## 2. Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Update `.env.local` with your deployed API Gateway base URL:

```env
NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com
```

The app will then run on:

```text
http://localhost:3000
```

---

## 3. Terraform setup and deploy

From the repo root:

```bash
cd infra
terraform init
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
```

After apply completes, get the API base URL:

```bash
terraform output -raw api_base_url
```

Paste that value into `frontend/.env.local` as `NEXT_PUBLIC_API_BASE_URL`.

---

## 4. Example `dev.tfvars`

A starter `dev.tfvars` is included in `infra/dev.tfvars`.

Update the placeholder values before running Terraform.

Key values:
- `project_name`
- `aws_region`
- `bucket_name`
- `anthropic_api_key`
- `cors_allow_origins`

---

## 5. Lambda environment and secrets

This starter stores the Anthropic API key in a Lambda environment variable provisioned by Terraform.

For the assessment brief, this satisfies the requirement of storing the AI key securely via environment variables.

**Important:**
- do not commit real secrets
- replace placeholder values in `dev.tfvars` locally before applying

---

## 6. Generate the Terraform plan output file

The assessment asks for a Terraform plan output text file inside `/infra`.

Run:

```bash
cd infra
terraform plan -var-file=dev.tfvars | tee terraform-plan.txt
```

This repo includes a placeholder `terraform-plan.txt` that explains why the real plan could not be generated in this environment. Before submission, replace it with your real local plan output.

---

## 7. Demo checklist

Use `docs/demo-checklist.md` to record a quick screen capture showing:
1. frontend running locally
2. request submitted
3. structured summary returned
4. Terraform files present
5. S3 object written after a request

---

## 8. AI usage history for submission

The brief explicitly asks for your AI usage history.

Suggested submission additions:
- export or screenshot your ChatGPT / Claude conversations
- include your prompts, debugging notes, and architecture prompts in `docs/`
- keep `docs/ai-usage.md` and expand it with your real workflow notes

---

## 9. Notes for submission

Before submitting, make sure you have:
- replaced the placeholder API key and bucket name values
- run `terraform plan -var-file=dev.tfvars | tee terraform-plan.txt`
- taken a screenshot or short video of the app working end-to-end
- pushed everything to GitHub

---

## 10. Potential improvements (optional)

If you have extra time, good polish points include:
- switching the model output to guaranteed JSON schema mode
- adding request IDs to the UI
- validating input length before submit
- adding tests for the Lambda parser
- moving the API key from env vars to SSM Parameter Store

---

## Model used

This starter defaults to an Anthropic Claude model via the Messages API. The exact model value is defined in Terraform as `model` and passed into Lambda as an environment variable.
