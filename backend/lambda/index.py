import json
import os
import re
import uuid
from datetime import datetime, timezone
from urllib import error, request

import boto3

s3_client = boto3.client("s3")

LOG_BUCKET_NAME = os.environ.get("LOG_BUCKET_NAME", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
CORS_ORIGIN = os.environ.get("CORS_ORIGIN", "http://localhost:3000")


def build_response(status_code: int, body: dict):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": CORS_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        "body": json.dumps(body),
    }


def extract_text_from_gemini(payload: dict) -> str:
    candidates = payload.get("candidates", [])
    if not candidates:
        raise ValueError(f"No candidates returned from Gemini: {json.dumps(payload)}")

    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [part.get("text", "") for part in parts if isinstance(part, dict) and part.get("text")]
    text = "\n".join(t for t in texts if t).strip()

    if not text:
        raise ValueError(f"Gemini returned no text: {json.dumps(payload)}")

    return text


def parse_bullet_lines(section_text: str) -> list[str]:
    items = []
    for line in section_text.splitlines():
        cleaned = re.sub(r"^\s*[-*•\d\.)]+\s*", "", line).strip()
        if cleaned:
            items.append(cleaned)
    return items


def parse_structured_summary(raw_text: str) -> dict:
    summary_match = re.search(r"Summary:\s*(.*?)\s*Key Decisions:", raw_text, re.DOTALL | re.IGNORECASE)
    decisions_match = re.search(r"Key Decisions:\s*(.*?)\s*Action Items:", raw_text, re.DOTALL | re.IGNORECASE)
    actions_match = re.search(r"Action Items:\s*(.*)$", raw_text, re.DOTALL | re.IGNORECASE)

    summary = summary_match.group(1).strip() if summary_match else raw_text.strip()
    decisions = parse_bullet_lines(decisions_match.group(1)) if decisions_match else []
    actions = parse_bullet_lines(actions_match.group(1)) if actions_match else []

    return {
        "summary": summary,
        "keyDecisions": decisions,
        "actionItems": actions,
    }


def build_prompt(meeting_notes: str) -> str:
    return f"""You are an expert executive assistant.

Read the following meeting notes and produce a concise structured summary.

Return your answer exactly in this format:
Summary: [2-3 sentence overview of the meeting]
Key Decisions:
  - [decision 1]
  - [decision 2]
Action Items:
  - [owner]: [task] by [date if mentioned]

Rules:
- Keep the summary factual and concise.
- Only include information supported by the notes.
- If no action item owner is explicitly mentioned, write Unknown Owner.
- If no date is mentioned, omit the date phrase.
- Keep bullet points short and readable.

Meeting notes:
{meeting_notes}
"""


def call_gemini(meeting_notes: str) -> str:
    if not GEMINI_API_KEY:
        raise ValueError("Missing GEMINI_API_KEY environment variable")

    prompt = build_prompt(meeting_notes)

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }

    req = request.Request(
        url=f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=30) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
            return extract_text_from_gemini(response_payload)
    except error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini API request failed: {exc.code} {details}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Network error calling Gemini API: {exc.reason}") from exc


def write_log_to_s3(meeting_notes: str, raw_output: str, parsed_output: dict) -> str | None:
    if not LOG_BUCKET_NAME:
        return None

    timestamp = datetime.now(timezone.utc).isoformat()
    log_key = f"logs/{datetime.now(timezone.utc).strftime('%Y/%m/%d')}/{uuid.uuid4()}.json"
    body = {
        "timestamp": timestamp,
        "input": meeting_notes,
        "raw_output": raw_output,
        "parsed_output": parsed_output,
    }

    s3_client.put_object(
        Bucket=LOG_BUCKET_NAME,
        Key=log_key,
        Body=json.dumps(body, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
    )
    return log_key


def handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "").upper()

    if method == "OPTIONS":
        return build_response(200, {"ok": True})

    try:
        body = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            import base64
            body = base64.b64decode(body).decode("utf-8")

        payload = json.loads(body)
        meeting_notes = (payload.get("meetingNotes") or "").strip()

        if not meeting_notes:
            return build_response(400, {"error": "meetingNotes is required"})

        raw_output = call_gemini(meeting_notes)
        parsed_output = parse_structured_summary(raw_output)
        log_key = write_log_to_s3(meeting_notes, raw_output, parsed_output)

        response_body = {
            **parsed_output,
            "rawModelResponse": raw_output,
            "logKey": log_key,
        }
        return build_response(200, response_body)

    except Exception as exc:
        return build_response(500, {"error": str(exc)})