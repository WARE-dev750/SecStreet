#!/usr/bin/env bash
# Deploy apps/web/public/ to Cloudflare Pages.
#
#   1. Install wrangler once:   npm i -g wrangler
#   2. Log in:                  wrangler login
#   3. Run this:                bash scripts/deploy-pages.sh
#
# First run creates the Pages project; subsequent runs push a new version.
set -euo pipefail

PROJECT_NAME="secstreet"

if ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler not installed. run: npm i -g wrangler"
  exit 1
fi

cd "$(dirname "$0")/.."

if ! wrangler pages project list 2>/dev/null | grep -q "$PROJECT_NAME"; then
  echo "creating Pages project: $PROJECT_NAME"
  wrangler pages project create "$PROJECT_NAME" --production-branch main
fi

echo "deploying apps/web/public to $PROJECT_NAME"
wrangler pages deploy apps/web/public --project-name "$PROJECT_NAME" --branch main
