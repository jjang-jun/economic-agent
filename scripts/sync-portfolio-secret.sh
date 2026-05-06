#!/usr/bin/env bash
set -euo pipefail

PORTFOLIO_FILE="${PORTFOLIO_FILE:-data/portfolio.json}"

if [[ ! -f "$PORTFOLIO_FILE" ]]; then
  echo "[portfolio-secret] file not found: $PORTFOLIO_FILE" >&2
  exit 1
fi

base64 < "$PORTFOLIO_FILE" | gh secret set PORTFOLIO_JSON_BASE64
echo "[portfolio-secret] PORTFOLIO_JSON_BASE64 updated from $PORTFOLIO_FILE"
