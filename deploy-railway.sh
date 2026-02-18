#!/bin/bash

# Railway Deployment Script for CollabBoard WebSocket Server

echo "🚀 CollabBoard WebSocket Server - Railway Deployment"
echo "======================================================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
else
    echo "✅ Railway CLI found"
fi

# Check login status
echo ""
echo "Checking Railway login status..."
if railway whoami &> /dev/null; then
    echo "✅ Logged in to Railway"
else
    echo "❌ Not logged in. Please run: railway login"
    exit 1
fi

# Navigate to server directory
cd apps/server

echo ""
echo "📦 Current directory: $(pwd)"
echo ""

# Check if project is linked
if railway status &> /dev/null; then
    echo "✅ Project already linked"
else
    echo "🔗 Linking to Railway project..."
    echo ""
    echo "Please select 'collabboard-ws' from the list"
    railway link
fi

# Set environment variables
echo ""
echo "⚙️  Setting environment variables..."
railway variables set PORT=1234
railway variables set CURSOR_PORT=1235
railway variables set SUPABASE_URL=https://ksnarsfklijkgrovdhgp.supabase.co
railway variables set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzbmFyc2ZrbGlqa2dyb3ZkaGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyODI0MjksImV4cCI6MjA4Njg1ODQyOX0.uwLMMOH1bwomECVna-NXCfltTghL3KBoAf38iQzEkZg

echo ""
echo "🚀 Deploying to Railway..."
railway up --detach

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "📊 Check deployment status:"
echo "   railway status"
echo ""
echo "📝 View logs:"
echo "   railway logs"
echo ""
echo "🌐 Get deployment URL:"
echo "   railway domain"
echo ""
echo "Done! 🎉"
