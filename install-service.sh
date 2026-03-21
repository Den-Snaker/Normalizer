#!/bin/bash
# ==================================================
#   NORMALIZER - Install as Systemd Service (Ubuntu)
# ==================================================
set -e

if [ "$EUID" -eq 0 ]; then
    echo "[ERROR] Do not run this script as root!"
    echo "Run without sudo: ./install-service.sh"
    exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-$HOME/Normalizer}"
USER_NAME=$(whoami)

echo "=================================================="
echo "   NORMALIZER - Install as Systemd Service"
echo "=================================================="
echo ""
echo "This will create systemd services for:"
echo "  - normalizer-backend (port 8000)"
echo "  - normalizer-frontend (port 3000)"
echo ""
echo "Installation directory: $INSTALL_DIR"
echo "User: $USER_NAME"
echo ""
echo "Services will start automatically on boot."
echo ""
read -p "Continue? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

# Check if installed
if [ ! -d "$INSTALL_DIR" ]; then
    echo "[ERROR] Normalizer not found at $INSTALL_DIR"
    echo "        Run install.sh first"
    exit 1
fi

# Create backend systemd service
echo ""
echo "Creating backend service..."

sudo tee /etc/systemd/system/normalizer-backend.service > /dev/null << EOF
[Unit]
Description=Normalizer Backend API
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$INSTALL_DIR/backend
Environment="PATH=$INSTALL_DIR/backend/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=$INSTALL_DIR/backend/venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Create frontend systemd service
echo "Creating frontend service..."

sudo tee /etc/systemd/system/normalizer-frontend.service > /dev/null << EOF
[Unit]
Description=Normalizer Frontend
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$INSTALL_DIR/frontend
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

# Enable services
echo "Enabling services..."
sudo systemctl enable normalizer-backend
sudo systemctl enable normalizer-frontend

# Ask to start now
echo ""
read -p "Start services now? (y/n): " START_NOW

if [ "$START_NOW" = "y" ] || [ "$START_NOW" = "Y" ]; then
    echo "Starting backend..."
    sudo systemctl start normalizer-backend
    
    echo "Starting frontend..."
    sudo systemctl start normalizer-frontend
    
    sleep 3
    
    echo ""
    echo "Service Status:"
    echo "==============="
    sudo systemctl status normalizer-backend --no-pager
    echo ""
    sudo systemctl status normalizer-frontend --no-pager
fi

echo ""
echo "=================================================="
echo "   SYSTEMD SERVICES INSTALLED"
echo "=================================================="
echo ""
echo "Commands:"
echo "  sudo systemctl start normalizer-backend    - Start backend"
echo "  sudo systemctl start normalizer-frontend   - Start frontend"
echo "  sudo systemctl stop normalizer-backend     - Stop backend"
echo "  sudo systemctl stop normalizer-frontend    - Stop frontend"
echo "  sudo systemctl restart normalizer-backend  - Restart backend"
echo "  sudo systemctl restart normalizer-frontend - Restart frontend"
echo "  sudo systemctl status normalizer-backend  - Backend status"
echo "  sudo systemctl status normalizer-frontend - Frontend status"
echo ""
echo "Logs:"
echo "  sudo journalctl -u normalizer-backend -f   - Backend logs"
echo "  sudo journalctl -u normalizer-frontend -f  - Frontend logs"
echo ""
echo "Services start automatically on boot."
echo "=================================================="