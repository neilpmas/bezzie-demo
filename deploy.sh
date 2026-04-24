#!/usr/bin/env bash
set -euo pipefail

echo "→ Building frontend..."
cd frontend && npm run build && cd ..

echo "→ Deploying upstream worker..."
cd upstream && npx wrangler deploy --config wrangler.production.toml && cd ..

echo "→ Deploying BFF worker..."
cd worker && npx wrangler deploy --config wrangler.production.toml && cd ..

echo "✓ Done — bezzie-demo deployed"
