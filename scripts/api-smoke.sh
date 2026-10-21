#!/usr/bin/env bash
#
# Evaluator smoke test for the Portfolio APIs (ADR-027, ADR-028).
#
# 1. Requests a short-lived token from POST /papi/v1/auth/token on the Experience Cloud
#    site domain, where Apex REST is served to the guest user.
# 2. Calls every GET path in salesforce-sapi.yaml and portfolio-papi.yaml on the
#    instance_url returned with the token, with the token as a Bearer credential.
# 3. Prints the status and the key headers for each path.
#
# Usage:
#   ./scripts/api-smoke.sh <email> "<purpose>"
#   EVALUATOR_EMAIL=you@example.com EVALUATOR_PURPOSE="Evaluating API design" ./scripts/api-smoke.sh
#
# Optional environment:
#   SITE_API_BASE  Apex REST base on the site domain (default below).
#
# This file holds no token, key or secret. The token lives only in this process's memory.
# Exit status: 1 when the token request fails, 2 when any GET path is not 200, 0 otherwise.

set -euo pipefail

EMAIL="${1:-${EVALUATOR_EMAIL:-}}"
PURPOSE="${2:-${EVALUATOR_PURPOSE:-}}"
SITE_API_BASE="${SITE_API_BASE:-https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest}"

if [[ -z "$EMAIL" || -z "$PURPOSE" ]]; then
  echo "Usage: $0 <email> \"<purpose>\"  (or set EVALUATOR_EMAIL and EVALUATOR_PURPOSE)" >&2
  exit 64
fi

command -v curl >/dev/null 2>&1 || {
  echo "curl is required." >&2
  exit 69
}

SAPI_PATHS=(
  /sapi/v1/health
  /sapi/v1/contacts
  /sapi/v1/accounts
  /sapi/v1/experience
  /sapi/v1/experience-highlights
  /sapi/v1/projects
  /sapi/v1/project-assets
  /sapi/v1/testimonials
  /sapi/v1/portfolio-config
  /sapi/v1/skills
  /sapi/v1/certifications
  /sapi/v1/education
  /sapi/v1/project-skills
  /sapi/v1/experience-skills
  /sapi/v1/certification-skills
)

PAPI_PATHS=(
  /papi/v1/health
  /papi/v1/profile/full
  /papi/v1/profile/summary
  /papi/v1/resume/generate
  /papi/v1/projects/featured
  /papi/v1/testimonials/feed
)

KEY_HEADERS="x-request-id|x-api-version|x-ratelimit-limit|x-ratelimit-remaining|retry-after|cache-control|x-total-count|x-has-more"

new_uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  elif [[ -r /proc/sys/kernel/random/uuid ]]; then
    cat /proc/sys/kernel/random/uuid
  else
    local h
    h="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
    printf '%s-%s-4%s-a%s-%s\n' "${h:0:8}" "${h:8:4}" "${h:13:3}" "${h:17:3}" "${h:20:12}"
  fi
}

# Escapes a value for a JSON string literal.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# Reads a top-level string or number field from a flat JSON object.
json_field() {
  local name="$1" file="$2"
  sed -n -e "s/.*\"$name\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
    -e "s/.*\"$name\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" "$file" | head -n 1
}

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# --- 1. Token -------------------------------------------------------------------------------

TOKEN_URL="$SITE_API_BASE/papi/v1/auth/token"
TOKEN_REQUEST_ID="$(new_uuid)"
BODY="{\"email\":\"$(json_escape "$EMAIL")\",\"purpose\":\"$(json_escape "$PURPOSE")\"}"

echo "POST $TOKEN_URL"
TOKEN_STATUS="$(curl -sS -o "$WORK_DIR/token.json" -D "$WORK_DIR/token.headers" -w '%{http_code}' \
  -X POST "$TOKEN_URL" \
  -H "Content-Type: application/json" \
  -H "X-API-Version: v1" \
  -H "X-Request-Id: $TOKEN_REQUEST_ID" \
  --data "$BODY")" || TOKEN_STATUS="000"

echo "  status $TOKEN_STATUS"
grep -iE "^($KEY_HEADERS):" "$WORK_DIR/token.headers" | sed 's/^/  /' | tr -d '\r' || true

if [[ "$TOKEN_STATUS" != "200" ]]; then
  echo "" >&2
  echo "FAILED: token request returned HTTP $TOKEN_STATUS. Response body:" >&2
  cat "$WORK_DIR/token.json" >&2 || true
  echo "" >&2
  exit 1
fi

ACCESS_TOKEN="$(json_field access_token "$WORK_DIR/token.json")"
INSTANCE_URL="$(json_field instance_url "$WORK_DIR/token.json")"
EXPIRES_IN="$(json_field expires_in "$WORK_DIR/token.json")"

if [[ -z "$ACCESS_TOKEN" || -z "$INSTANCE_URL" ]]; then
  echo "FAILED: token response is missing access_token or instance_url." >&2
  exit 1
fi

# Accept an instance_url that is the My Domain root or already ends in /services/apexrest.
INSTANCE_URL="${INSTANCE_URL%/}"
if [[ "$INSTANCE_URL" == */services/apexrest ]]; then
  API_BASE="$INSTANCE_URL"
else
  API_BASE="$INSTANCE_URL/services/apexrest"
fi

echo "  instance_url $INSTANCE_URL"
echo "  expires_in ${EXPIRES_IN:-unknown}"
echo ""

# --- 2. GET every path ----------------------------------------------------------------------

FAILURES=0

call_path() {
  local path="$1" request_id status
  request_id="$(new_uuid)"
  status="$(curl -sS -o "$WORK_DIR/body.json" -D "$WORK_DIR/headers.txt" -w '%{http_code}' \
    "$API_BASE$path" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "X-API-Version: v1" \
    -H "X-Request-Id: $request_id")" || status="000"

  echo "GET $path"
  echo "  status $status (sent X-Request-Id $request_id)"
  grep -iE "^($KEY_HEADERS):" "$WORK_DIR/headers.txt" | sed 's/^/  /' | tr -d '\r' || true
  if [[ "$status" != "200" ]]; then
    FAILURES=$((FAILURES + 1))
    echo "  body $(head -c 300 "$WORK_DIR/body.json" | tr -d '\r\n')"
  fi
  echo ""
}

for path in "${SAPI_PATHS[@]}" "${PAPI_PATHS[@]}"; do
  call_path "$path"
done

TOTAL=$((${#SAPI_PATHS[@]} + ${#PAPI_PATHS[@]}))
echo "$((TOTAL - FAILURES)) of $TOTAL GET paths returned 200."
if [[ "$FAILURES" -gt 0 ]]; then
  exit 2
fi
