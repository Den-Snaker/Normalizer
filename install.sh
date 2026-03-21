#!/bin/bash
# ==================================================
#    NORMALIZER - Installation Script for Ubuntu 24
# ==================================================
set -e

INSTALL_DIR="${INSTALL_DIR:-$HOME/Normalizer}"
BRANCH="${BRANCH:-main}"

echo "=================================================="
echo "   NORMALIZER - Installation Script for Ubuntu 24"
echo "=================================================="
echo ""
echo "This script will:"
echo "  1. Check and install prerequisites"
echo "  2. Clone repository from GitHub"
echo "  3. Install dependencies"
echo "  4. Build frontend"
echo "  5. Create systemd services"
echo "  6. Create management scripts"
echo ""
echo "Installation directory: $INSTALL_DIR"
echo ""
read -p "Press Enter to continue..."

# ==================================================
# STEP 1: CHECK PREREQUISITES
# ==================================================
echo ""
echo "[Step 1/6] Checking prerequisites..."
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "[WARNING] Running as root is not recommended."
    echo "         Run this script as a regular user."
    echo "         Press Ctrl+C to cancel, or Enter to continue..."
    read -p ""
fi

# Update package list
echo "Updating package list..."
sudo apt-get update -qq

# Install Git
if ! command -v git &> /dev/null; then
    echo "Installing Git..."
    sudo apt-get install -y git
fi
echo "[OK] Git: $(git --version)"

# Install Node.js 20
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
NODE_VERSION=$(node --version)
echo "[OK] Node.js: $NODE_VERSION"

# Install Python 3
if ! command -v python3 &> /dev/null; then
    echo "Installing Python 3..."
    sudo apt-get install -y python3 python3-pip python3-venv
fi
PYTHON_VERSION=$(python3 --version)
echo "[OK] Python: $PYTHON_VERSION"

# Install pip if needed
if ! command -v pip3 &> /dev/null; then
    echo "Installing pip..."
    sudo apt-get install -y python3-pip
fi
echo "[OK] pip3 installed"

# Install PostgreSQL (optional)
if ! command -v psql &> /dev/null; then
    echo ""
    read -p "Install PostgreSQL? (y/n): " INSTALL_POSTGRES
    if [ "$INSTALL_POSTGRES" = "y" ] || [ "$INSTALL_POSTGRES" = "Y" ]; then
        echo "Installing PostgreSQL..."
        sudo apt-get install -y postgresql postgresql-contrib
        sudo systemctl enable postgresql
        sudo systemctl start postgresql
        echo "[OK] PostgreSQL installed"
    else
        echo "[SKIP] PostgreSQL skipped"
    fi
else
    echo "[OK] PostgreSQL: $(psql --version)"
fi

# Install build tools for native modules
echo "Installing build tools..."
sudo apt-get install -y build-essential python3-dev libpq-dev 2>/dev/null || true
echo "[OK] Build tools installed"

echo ""
echo "All prerequisites installed!"
echo ""

# ==================================================
# STEP 2: CLONE REPOSITORY
# ==================================================
echo "[Step 2/6] Cloning repository from GitHub..."
echo ""

if [ -d "$INSTALL_DIR" ]; then
    echo "[WARNING] Directory '$INSTALL_DIR' already exists!"
    echo ""
    read -p "Delete and reinstall? (y/n): " REINSTALL
    if [ "$REINSTALL" = "y" ] || [ "$REINSTALL" = "Y" ]; then
        echo "Removing existing installation..."
        rm -rf "$INSTALL_DIR"
    else
        echo "Installation cancelled."
        exit 1
    fi
fi

git clone --branch "$BRANCH" https://github.com/Den-Snaker/Normalizer.git "$INSTALL_DIR"
echo "[OK] Repository cloned to $INSTALL_DIR"
echo ""

# ==================================================
# STEP 3: INSTALL BACKEND DEPENDENCIES
# ==================================================
echo "[Step 3/6] Installing backend dependencies..."
echo ""

cd "$INSTALL_DIR/backend"

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

echo "[OK] Backend dependencies installed"
echo ""

# ==================================================
# STEP 4: INSTALL FRONTEND DEPENDENCIES
# ==================================================
echo "[Step 4/6] Installing frontend dependencies..."
echo ""

cd "$INSTALL_DIR/frontend"

npm install
echo "[OK] Frontend dependencies installed"
echo ""

# ==================================================
# STEP 5: BUILD FRONTEND
# ==================================================
echo "[Step 5/6] Building frontend..."
echo ""

npm run build
echo "[OK] Frontend built successfully"
echo ""

# ==================================================
# STEP 6: CREATE MANAGEMENT SCRIPTS
# ==================================================
echo "[Step 6/6] Creating management scripts..."
echo ""

cd "$INSTALL_DIR"

# Create .env file if not exists
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        echo "[OK] Created backend/.env from example"
    fi
fi

# Create start.sh
cat > start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
./servers.sh start
EOF
chmod +x start.sh

# Create stop.sh
cat > stop.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
./servers.sh stop
EOF
chmod +x stop.sh

# Create restart.sh
cat > restart.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
./servers.sh restart
EOF
chmod +x restart.sh

# Create status.sh
cat > status.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
./servers.sh status
EOF
chmod +x status.sh

# Create update.sh
cat > update.sh << EOF
#!/bin/bash
set -e
cd "$INSTALL_DIR"

echo "=================================================="
echo "   NORMALIZER - Update from GitHub"
echo "=================================================="
echo ""

echo "[1/4] Stopping services..."
./servers.sh stop || true

echo ""
echo "[2/4] Pulling latest changes..."
git fetch origin
git pull origin main

echo ""
echo "[3/4] Updating backend..."
cd "$INSTALL_DIR/backend"
source venv/bin/activate
pip install -r requirements.txt

echo ""
echo "[4/4] Updating frontend..."
cd "$INSTALL_DIR/frontend"
npm install
npm run build

echo ""
echo "=================================================="
echo "   Update completed!"
echo "=================================================="
echo ""
echo "Run './start.sh' to start the application."
EOF
chmod +x update.sh

# Create servers.sh
cat > servers.sh << 'EOFSCRIPT'
#!/bin/bash
set -e
cd "$(dirname "$0")"

FRONTEND_DIR="$(pwd)/frontend"
BACKEND_DIR="$(pwd)/backend"
FRONTEND_PID=""
BACKEND_PID=""
LOG_DIR="$(pwd)/logs"

mkdir -p "$LOG_DIR"

check_backend() {
    if curl -s http://localhost:8000/ > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

check_frontend() {
    if curl -s http://localhost:3000/ > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

start_backend() {
    echo "Starting Backend..."
    cd "$BACKEND_DIR"
    source venv/bin/activate
    nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$BACKEND_DIR/backend.pid"
    sleep 2
    if check_backend; then
        echo "[OK] Backend started on http://localhost:8000/"
    else
        echo "[ERROR] Backend failed to start"
        cat "$LOG_DIR/backend.log"
        exit 1
    fi
}

start_frontend() {
    echo "Starting Frontend..."
    cd "$FRONTEND_DIR"
    nohup npm run dev -- --host 0.0.0.0 --port 3000 > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$FRONTEND_DIR/frontend.pid"
    sleep 3
    if check_frontend; then
        echo "[OK] Frontend started on http://localhost:3000/"
    else
        echo "[ERROR] Frontend failed to start"
        cat "$LOG_DIR/frontend.log"
        exit 1
    fi
}

stop_backend() {
    echo "Stopping Backend..."
    if [ -f "$BACKEND_DIR/backend.pid" ]; then
        kill $(cat "$BACKEND_DIR/backend.pid") 2>/dev/null || true
        rm -f "$BACKEND_DIR/backend.pid"
    fi
    pkill -f "uvicorn main:app" 2>/dev/null || true
    echo "[OK] Backend stopped"
}

stop_frontend() {
    echo "Stopping Frontend..."
    if [ -f "$FRONTEND_DIR/frontend.pid" ]; then
        kill $(cat "$FRONTEND_DIR/frontend.pid") 2>/dev/null || true
        rm -f "$FRONTEND_DIR/frontend.pid"
    fi
    pkill -f "vite" 2>/dev/null || true
    echo "[OK] Frontend stopped"
}

show_status() {
    echo ""
    echo "Server Status:"
    echo "==============="
    if check_backend; then
        echo "Backend:  [ON]  http://localhost:8000/"
    else
        echo "Backend:  [OFF]"
    fi
    
    if check_frontend; then
        echo "Frontend: [ON]  http://localhost:3000/"
    else
        echo "Frontend: [OFF]"
    fi
    echo ""
}

case "${1:-status}" in
    start)
        echo "=================================================="
        echo "   Starting Normalizer Servers"
        echo "=================================================="
        echo ""
        start_backend
        start_frontend
        echo ""
        echo "=================================================="
        echo "   Servers started!"
        echo "   Frontend: http://localhost:3000/"
        echo "   Backend:  http://localhost:8000/"
        echo "=================================================="
        ;;
    stop)
        echo "=================================================="
        echo "   Stopping Normalizer Servers"
        echo "=================================================="
        echo ""
        stop_backend
        stop_frontend
        echo ""
        echo "=================================================="
        echo "   Servers stopped"
        echo "=================================================="
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    status)
        show_status
        ;;
    logs)
        echo "Backend logs:"
        tail -50 "$LOG_DIR/backend.log" 2>/dev/null || echo "No backend logs"
        echo ""
        echo "Frontend logs:"
        tail -50 "$LOG_DIR/frontend.log" 2>/dev/null || echo "No frontend logs"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
EOFSCRIPT
chmod +x servers.sh

echo "[OK] Management scripts created"
echo ""

# ==================================================
# COMPLETE
# ==================================================
echo ""
echo "=================================================="
echo "   INSTALLATION COMPLETED!"
echo "=================================================="
echo ""
echo "Installation directory: $INSTALL_DIR"
echo ""
echo "Next steps:"
echo ""
echo "  1. Configure API keys:"
echo "     nano $INSTALL_DIR/frontend/.env.local"
echo ""
echo "     Add your keys:"
echo "     VITE_GEMINI_API_KEY=your_key"
echo "     VITE_OPENROUTER_API_KEY=your_key"
echo "     VITE_API_URL=http://localhost:8000"
echo ""
echo "  2. Start servers:"
echo "     cd $INSTALL_DIR"
echo "     ./servers.sh start"
echo ""
echo "  3. Open in browser:"
echo "     http://localhost:3000/"
echo ""
echo "=================================================="
echo ""
echo "Management commands:"
echo "  ./start.sh      - Start servers"
echo "  ./stop.sh       - Stop servers"
echo "  ./restart.sh    - Restart servers"
echo "  ./status.sh     - Check status"
echo "  ./update.sh     - Update from GitHub"
echo "  ./servers.sh    - Interactive menu"
echo ""
echo "=================================================="