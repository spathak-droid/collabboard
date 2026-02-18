#!/bin/bash

echo "🚀 Deploying Cursor Sync Server to Railway"
echo "=========================================="
echo ""

cd "$(dirname "$0")"

echo "📦 Current directory: $(pwd)"
echo ""

echo "✅ Checking Railway login..."
if ! railway whoami > /dev/null 2>&1; then
  echo "❌ Not logged into Railway"
  echo "🔑 Opening browser for authentication..."
  railway login
fi

echo "✅ Logged in as: $(railway whoami)"
echo ""

echo "🔗 Initializing Railway project..."
echo "   (Follow the prompts to create a new project)"
echo ""
railway init

echo ""
echo "📤 Deploying to Railway..."
railway up

echo ""
echo "🌐 Generating public domain..."
railway domain

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Copy the Railway URL above"
echo "   2. Add to Vercel as: NEXT_PUBLIC_CURSOR_WS_URL=wss://YOUR-URL.railway.app"
echo "   3. Redeploy your frontend"
echo ""
echo "🧪 Test deployment:"
echo "   railway logs"
echo "   curl https://YOUR-URL.railway.app/health"
echo ""
