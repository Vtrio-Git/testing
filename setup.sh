#!/bin/bash
set -e

echo "======================================"
echo "  RPC Monitor — Setup Script"
echo "======================================"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install Node.js 18+ first."
  echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "   sudo apt-get install -y nodejs"
  exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Current: $(node -v)"
  exit 1
fi

echo "✅ Node.js $(node -v)"

# Backend
echo ""
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

# Frontend
echo ""
echo "📦 Installing frontend dependencies..."
cd frontend
npm install

echo ""
echo "🏗  Building frontend..."
npm run build
cd ..

# Copy built frontend to be served by backend
mkdir -p backend/public
cp -r frontend/build/* backend/public/

echo ""
echo "✅ Build complete!"
echo ""
echo "To start the server:"
echo "  cd backend && node server.js"
echo ""
echo "Or to run with PM2 (recommended for production):"
echo "  npm install -g pm2"
echo "  cd backend && pm2 start server.js --name rpc-monitor"
echo "  pm2 save && pm2 startup"
echo ""
echo "The interface will be available at: http://YOUR_SERVER_IP:3001"
