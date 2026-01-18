#!/bin/bash
set -e

# Change to web directory
cd "$(dirname "$0")/.."

echo "🔍 Verifying build..."
npm run build

BUILD_SIZE=$(du -sh dist | cut -f1)
echo "📦 Build size: $BUILD_SIZE"

if [ -f "dist/index.html" ]; then
  echo "✅ Build verification passed"
else
  echo "❌ Build verification failed - missing dist/index.html"
  exit 1
fi
