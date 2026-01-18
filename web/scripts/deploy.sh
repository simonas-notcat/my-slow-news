#!/bin/bash
set -e

echo "🚀 Deploying My Slow News Web App to Vercel..."

# Change to web directory
cd "$(dirname "$0")/.."

echo "📦 Installing dependencies..."
npm ci

echo "🔍 Type checking..."
npm run typecheck

echo "🧪 Running tests..."
npm run test:ci

echo "🏗️  Building production bundle..."
npm run build

echo "📤 Deploying to Vercel..."
vercel deploy --prod

echo "✅ Deployment complete!"
