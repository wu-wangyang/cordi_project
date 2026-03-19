# AI usage 
<img width="860" height="724" alt="Screenshot 2026-03-19 at 12 55 58" src="https://github.com/user-attachments/assets/a7de6a47-d98e-45c4-88af-421a2862d8aa" />
Me: based on this document, can you help me to design a simple structured codes?
ChatGPT: Yes — based on the assessment, the simplest safe design is:

* **Next.js 15 frontend**
* **one Lambda function**
* **API Gateway in front**
* **S3 log for every request**
* **Terraform split into logical files**
* **very small parsing layer so the frontend always gets clean JSON**  

I’d recommend this repo structure:

```text
cordi-meeting-summariser/
├── frontend/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   └── api.ts
│   ├── .env.local.example
│   ├── package.json
│   └── tsconfig.json
│
├── lambda/
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
├── infra/
│   ├── provider.tf
│   ├── variables.tf
│   ├── s3.tf
│   ├── iam.tf
│   ├── lambda.tf
│   ├── api_gateway.tf
│   ├── outputs.tf
│   ├── dev.tfvars
│   └── terraform-plan.txt
│
├── README.md
└── .gitignore
```

This matches the document’s required layers and deliverables: single-page frontend, Lambda + API Gateway, S3 logging, Terraform by resource type, `dev.tfvars`, README, and plan output.  

## 1) Frontend types

```ts
// frontend/lib/api.ts
export type SummaryResponse = {
  summary: string;
  keyDecisions: string[];
  actionItems: string[];
  rawModelOutput?: string;
  logKey?: string;
};

export async function submitMeetingNotes(notes: string): Promise<SummaryResponse> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  }

  const res = await fetch(`${apiBaseUrl}/summarise`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ notes }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}
```

## 2) Frontend page

This satisfies the requirement for one text area, one submit button, loading state, clean display, and graceful error handling. 

```tsx
// frontend/app/page.tsx
"use client";

import { useState } from "react";
import { submitMeetingNotes, type SummaryResponse } from "@/lib/api";

export default function HomePage() {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SummaryResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (!notes.trim()) {
      setError("Please paste some meeting notes.");
      return;
    }

    try {
      setLoading(true);
      const data = await submitMeetingNotes(notes);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            AI Meeting Notes Summariser
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Paste raw meeting notes and get a structured summary.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl bg-white p-6 shadow-sm border space-y-4"
        >
          <label className="block text-sm font-medium text-gray-700">
            Raw meeting notes
          </label>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={12}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm outline-none focus:border-black"
            placeholder="Paste meeting notes here..."
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Summarising..." : "Generate Summary"}
          </button>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </form>

        {result && (
          <section className="rounded-xl bg-white p-6 shadow-sm border space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Summary</h2>
              <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                {result.summary}
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">Key Decisions</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
                {result.keyDecisions.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold">Action Items</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
                {result.actionItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            {result.logKey && (
              <p className="text-xs text-gray-500">S3 log key: {result.logKey}</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
```

## 3) Lambda handler

The assessment says the Lambda should accept notes, call Claude/OpenAI, return a structured summary, and write input/output/timestamp to S3. 

Below is a **simple Node.js Lambda** using Claude:

```js
// lambda/index.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION });

function parseStructuredOutput(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  let summary = "";
  const keyDecisions = [];
  const actionItems = [];

  let mode = "";

  for (const line of lines) {
    if (line.startsWith("Summary:")) {
      summary = line.replace("Summary:", "").trim();
      mode = "summary";
    } else if (line.startsWith("Key Decisions:")) {
      mode = "decisions";
    } else if (line.startsWith("Action Items:")) {
      mode = "actions";
    } else if (line.startsWith("-")) {
      const item = line.replace(/^-/, "").trim();
      if (mode === "decisions") keyDecisions.push(item);
      if (mode === "actions") actionItems.push(item);
    } else if (mode === "summary") {
      summary += ` ${line}`;
    }
  }

  return {
    summary: summary.trim(),
    keyDecisions,
    actionItems,
  };
}

async function callClaude(notes) {
  const prompt = `
You are a meeting notes summariser.

Return the result in exactly this format:

Summary: [2-3 sentence overview of the meeting]
Key Decisions:
  - [decision 1]
  - [decision 2]
Action Items:
  - [owner]: [task] by [date if mentioned]

Meeting notes:
${notes}
`.trim();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error: ${errText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const notes = body.notes?.trim();

    if (!notes) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "http://localhost:3000",
        },
        body: JSON.stringify({ error: "notes is required" }),
      };
    }

    const modelOutput = await callClaude(notes);
    const parsed = parseStructuredOutput(modelOutput);

    const timestamp = new Date().toISOString();
    const logKey = `logs/${Date.now()}.json`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.LOG_BUCKET_NAME,
        Key: logKey,
        ContentType: "application/json",
        Body: JSON.stringify(
          {
            timestamp,
            rawInput: notes,
            modelOutput,
            parsedOutput: parsed,
          },
          null,
          2
        ),
      })
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "http://localhost:3000",
      },
      body: JSON.stringify({
        ...parsed,
        rawModelOutput: modelOutput,
        logKey,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "http://localhost:3000",
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
    };
  }
};
```

## 4) Lambda package.json

```json
{
  "name": "cordi-lambda",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.750.0"
  }
}
```

## 5) Terraform structure

The document explicitly asks for Terraform to define all resources and to split files like `lambda.tf`, `s3.tf`, `iam.tf`, `api_gateway.tf`, plus `dev.tfvars`. 

### provider.tf

```hcl
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
```

### variables.tf

```hcl
variable "aws_region" {
  type = string
}

variable "project_name" {
  type = string
}

variable "claude_api_key" {
  type      = string
  sensitive = true
}

variable "claude_model" {
  type    = string
  default = "claude-3-5-sonnet-20241022"
}
```

### s3.tf

```hcl
resource "aws_s3_bucket" "logs" {
  bucket = "${var.project_name}-logs-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "logs" {
  bucket = aws_s3_bucket.logs.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_caller_identity" "current" {}
```

### iam.tf

```hcl
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "s3_write_policy" {
  name = "${var.project_name}-s3-write-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.logs.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "s3_write_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.s3_write_policy.arn
}
```

### lambda.tf

```hcl
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda"
  output_path = "${path.module}/lambda.zip"
}

resource "aws_lambda_function" "summariser" {
  function_name = "${var.project_name}-summariser"
  role          = aws_iam_role.lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  timeout       = 30

  environment {
    variables = {
      LOG_BUCKET_NAME = aws_s3_bucket.logs.bucket
      CLAUDE_API_KEY  = var.claude_api_key
      CLAUDE_MODEL    = var.claude_model
    }
  }
}
```

### api_gateway.tf

```hcl
resource "aws_apigatewayv2_api" "http_api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["http://localhost:3000"]
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["content-type"]
  }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.summariser.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "summarise_route" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /summarise"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "allow_apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.summariser.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
```

### outputs.tf

```hcl
output "api_base_url" {
  value = aws_apigatewayv2_api.http_api.api_endpoint
}

output "log_bucket_name" {
  value = aws_s3_bucket.logs.bucket
}
```

### dev.tfvars

```hcl
aws_region     = "ap-southeast-2"
project_name   = "cordi-meeting-notes"
claude_api_key = "replace-me"
claude_model   = "claude-3-5-sonnet-20241022"
```

## 6) Frontend env example

```bash
# frontend/.env.local.example
NEXT_PUBLIC_API_BASE_URL=https://your-api-id.execute-api.ap-southeast-2.amazonaws.com
```

## 7) Why this is the safest simple design

This structure is strong because it directly follows the assessment instead of adding extra layers:

* one page only
* one Lambda only
* one POST endpoint only
* one S3 logging bucket
* Terraform separated by resource type
* readable code and README focus, which are explicitly evaluated  

## 8) What to put in README

Your README should include:

* project overview
* architecture diagram or simple flow
* how to run `terraform init`, `terraform plan -var-file=dev.tfvars`, `terraform apply -var-file=dev.tfvars`
* how to create `frontend/.env.local`
* how to run `npm install` and `npm run dev`
* model used
* note on AI usage and attached AI history
* blockers if any  

## 9) Best practical tip

For the submission, keep the backend response as **clean JSON** even if the model returns formatted text. That gives you:

* easier frontend rendering
* less fragile UI
* better error handling
* cleaner demo

If you want, I can now turn this into a **full copy-paste starter repo** with each file written out one by one.

<img width="694" height="365" alt="Screenshot 2026-03-19 at 13 02 44" src="https://github.com/user-attachments/assets/efa5a495-df6a-4408-b82b-53100c1e4da7" />

ME: can you give me a few examples of raw meeting notes so that I can test it
ChatGPT: 
Absolutely — here are a few raw meeting notes examples in different styles so you can test both clean and messy inputs.
## Example 1 — fairly clear notes

```text
Weekly Product Sync - March 18

Attendees: Sarah, Tom, Nina, Alex

- Reviewed progress on the meeting summariser project
- Frontend is mostly done, textarea + submit button working
- Backend Lambda can call model successfully
- Still need better error handling for empty input and API failures
- Tom suggested adding loading spinner and disabled button state
- Nina wants responses formatted into summary, key decisions, action items
- Agreed not to add authentication for this assessment because scope is small
- Alex to finish Terraform for S3 logging by Friday
- Sarah to update README with setup instructions
- Need to test with messy real-world notes before demo
- Next check-in Monday 10am
```

## Example 2 — more natural / messy human notes

```text
Team catch-up today

people there: Jess, Michael, Tony

talked about the AI notes tool
frontend looks okay but still basic
need nicer spacing maybe cards for output
API worked once but then got error, maybe env issue?
Michael said check if .env.local is set correctly
Jess asked whether we are saving request logs -> yes should go to S3
Need to make sure log includes raw notes, model response, parsed output, timestamp
also discussed whether to use Claude or OpenAI, decided Claude for now since key already provided
Tony will clean up lambda code
Jess doing README
Michael testing terraform apply again tonight

important:
- keep it simple
- don't overbuild
- make sure demo works locally

next meeting Thursday afternoon
```

## Example 3 — includes decisions and deadlines

```text
Sprint planning meeting

Attendees: Emma, Daniel, Chris, Olivia

Agenda:
1. Demo readiness
2. Infra status
3. Testing

Notes:
- Demo should focus on end-to-end flow only
- No need for user login or database
- API Gateway + Lambda + S3 is enough
- Daniel confirmed Terraform files will be split into provider, iam, lambda, s3, api gateway, outputs
- Emma wants at least 3 test inputs in README
- Chris found issue with malformed model output breaking parser
- Decided to add fallback parser if headings are missing
- Olivia asked for cleaner UI but agreed not to spend too much time on styling

Actions:
- Daniel finish infra by Wed 5pm
- Chris fix parser robustness tonight
- Emma write sample meeting notes for testing
- Olivia polish frontend before Thursday morning
```

## Example 4 — very messy shorthand notes

```text
proj sync
att: aaron / mia / lucy

- lambda basically works
- output okay but sometimes weird formatting
- parser maybe too strict?
- if model doesnt return exact headings UI breaks
- should handle missing bullets maybe split lines better
- s3 logging not tested yet
- bucket permissions ?? check IAM
- frontend:
  - textarea good
  - button okay
  - results section maybe too plain
  - loading state needed
- no auth
- no db
- simple only

todo
aaron -> IAM + bucket policy
mia -> parser cleanup
lucy -> UI spacing + README screenshots

maybe deploy tomorrow if terraform passes
```

## Example 5 — includes side conversations / real-life noise

```text
Operations meeting notes

Started a few mins late because Zoom audio issue.

Present: Kevin, Laura, Ben, Rachel

- Kevin gave quick update on current build
- frontend can now submit notes to backend
- Laura asked if users can paste very long notes, not tested yet
- Ben mentioned maybe adding character limit but no final decision
- Rachel said not necessary for first version
- We checked the sample output and the summary was okay, but action items missed owner names
- Laura suggested prompt should explicitly ask for owner + task + due date where available
- Kevin said he can update prompt today
- discussed logs:
  save raw input? yes
  save raw model output? yes
  save parsed output? yes
  save timestamp? yes
- Ben still blocked by CORS issue locally
- Rachel to help test after lunch

Decision:
ship simple version first, polish later

Actions:
Kevin update prompt
Ben fix CORS issue
Laura prepare demo script
Rachel test 3 examples before final submission
```

## Example 6 — bad-quality notes for robustness testing

```text
meeting about app

everyone says ui okay
need fix backend
s3 yes
terraform maybe broken because role issue
api key works? sometimes
summary should be short
decisions bullets
actions bullets
readme needs setup
who does what:
sam backend
jo readme
li test

deadline maybe friday not sure
next meeting maybe 2pm monday
```

## Example 7 — long-ish realistic product meeting

```text
Product + Engineering Alignment Meeting

Attendees: Priya, Ethan, Marco, Helen, Zoe

Discussion:
- Priya opened with timeline concerns for the technical assessment submission
- Ethan said current MVP is functional: user pastes notes, frontend sends request, backend returns structured response
- Marco demoed Lambda logs and showed a sample JSON object stored in S3
- Helen asked whether we should include the raw model output in API response for debugging
- Zoe said yes for development, but maybe hide it from UI unless needed
- Team agreed that the visible UI should mainly show summary, key decisions, and action items
- We discussed parsing strategy:
  1. prompt model into strict format
  2. parse headings
  3. fallback gracefully if output is slightly inconsistent
- Priya emphasised that reliability is more important than fancy UI
- Ethan raised concern about timeout if notes are too large
- Marco suggested keeping Lambda timeout at 30 seconds for now
- Helen reminded everyone that README must include architecture, setup steps, and AI usage disclosure

Decisions:
- Keep architecture serverless and minimal
- Use Claude as default model
- Log all requests to S3
- Prioritise robust parsing over advanced styling

Action items:
- Ethan: improve frontend error handling by tomorrow morning
- Marco: finalise Terraform and test fresh deploy tonight
- Helen: write README and deployment notes by tomorrow
- Zoe: prepare messy meeting-note test cases
- Priya: review final submission package before deadline
```

<img width="742" height="428" alt="Screenshot 2026-03-19 at 13 03 56" src="https://github.com/user-attachments/assets/f3e285ff-18ea-4258-92eb-17c504d4f332" />

ME: how to install terraform and apply
ChatGPT: Yes — for your project, the simplest flow on your Mac is:

1. install Terraform with Homebrew
2. verify it
3. go into your `infra/` folder
4. run `terraform init`
5. run `terraform plan -var-file=dev.tfvars`
6. run `terraform apply -var-file=dev.tfvars` ([HashiCorp Developer][1])

Install Terraform on macOS:

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
terraform -version
```

HashiCorp’s official macOS install method uses the `hashicorp/tap` Homebrew repo, and `terraform -version` is the usual way to verify the CLI is installed. ([HashiCorp Developer][1])

Then open your project and move into the Terraform directory:

```bash
cd /path/to/your/project/infra
```

The `terraform init` command is the first command you should run in a Terraform working directory, and it is safe to run it multiple times. ([HashiCorp Developer][2])

Run:

```bash
terraform init
```

That downloads the providers and prepares the directory so Terraform can work with your configuration. ([HashiCorp Developer][2])

Before applying, make sure your AWS credentials are available in your shell, because your assessment is deploying AWS resources such as Lambda, S3, IAM, and API Gateway. A common setup is:

```bash
aws configure
```

Then enter your AWS access key, secret key, and region. Terraform’s AWS tutorials expect you to authenticate to AWS before planning and applying infrastructure. ([HashiCorp Developer][3])

Next, make sure your `infra/dev.tfvars` has your real values, especially the Claude API key. For example:

```hcl
aws_region     = "ap-southeast-2"
project_name   = "cordi-meeting-notes"
claude_api_key = "your-real-key"
claude_model   = "claude-3-5-sonnet-20241022"
```

Then preview the changes:

```bash
terraform plan -var-file=dev.tfvars
```

`terraform plan` shows you the execution plan before anything is created. ([HashiCorp Developer][4])

If the plan looks correct, apply it:

```bash
terraform apply -var-file=dev.tfvars
```

The `terraform apply` command executes the actions in the plan to create or update your infrastructure. By default it will ask you to confirm before proceeding. ([HashiCorp Developer][5])

After it finishes, get your API URL with:

```bash
terraform output api_base_url
```

or the raw value only:

```bash
terraform output -raw api_base_url
```

Terraform outputs are the normal way to retrieve values like your deployed API endpoint from your configuration. ([HashiCorp Developer][3])

For your specific repo, the full command sequence will probably be:

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
terraform -version

cd infra
terraform init
terraform plan -var-file=dev.tfvars
terraform apply -var-file=dev.tfvars
terraform output -raw api_base_url
```

If you get stuck on any error from `init`, `plan`, or `apply`, paste the terminal output here and I’ll tell you exactly what to fix.




