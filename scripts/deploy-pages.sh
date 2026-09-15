#!/usr/bin/env bash
# Build the static public site and deploy it to Cloudflare Pages.
#
#   1. One-time: npm i -g wrangler && wrangler login
#   2. Run:      bash scripts/deploy-pages.sh
#
# What ships: a landing page (as index), the library, the search JSON,
# and shared CSS. The IDE is local-only and is not deployed.
set -euo pipefail

cd "$(dirname "$0")/.."

# 1. Rebuild the capabilities.json that the library page reads.
echo "building capabilities.json..."
node scripts/build-capabilities-json.mjs

# 2. Assemble a clean deploy directory.
STAGE=deploy
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp apps/web/public/landing.html   "$STAGE/index.html"
cp apps/web/public/library.html    "$STAGE/library.html"
cp apps/web/public/sandboxes.html  "$STAGE/sandboxes.html"
cp apps/web/public/community.html  "$STAGE/community.html"
cp apps/web/public/schools.html    "$STAGE/schools.html"
cp apps/web/public/community.html  "$STAGE/community.html"
cp apps/web/public/library.js      "$STAGE/library.js"
cp apps/web/public/canvas-workspace.html "$STAGE/canvas-workspace.html"
cp apps/web/public/canvas-workspace.css  "$STAGE/canvas-workspace.css"
cp apps/web/public/canvas-workspace.js   "$STAGE/canvas-workspace.js"
cp apps/web/public/canvas-workspace.html "$STAGE/canvas-workspace.html"
cp apps/web/public/canvas-workspace.css  "$STAGE/canvas-workspace.css"
cp apps/web/public/canvas-workspace.js   "$STAGE/canvas-workspace.js"
cp apps/web/public/library.css    "$STAGE/library.css"
cp apps/web/public/shared.css     "$STAGE/shared.css"
cp apps/web/public/capabilities.json "$STAGE/capabilities.json"

# 3. Deploy.
PROJECT_NAME="secstreet"
echo "deploying $STAGE to Cloudflare Pages ($PROJECT_NAME)..."
wrangler pages deploy "$STAGE" --project-name "$PROJECT_NAME" --branch main --commit-dirty=true
