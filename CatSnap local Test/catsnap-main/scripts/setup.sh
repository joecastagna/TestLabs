#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[setup]${NC} $1"; }
warn()  { echo -e "${YELLOW}[setup]${NC} $1"; }
error() { echo -e "${RED}[setup]${NC} $1"; exit 1; }

has() { command -v "$1" &>/dev/null; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── podman ────────────────────────────────────────────────────────────────────
if has podman; then
    info "podman already installed: $(podman --version)"
else
    info "Installing podman..."
    sudo apt-get update -qq
    sudo apt-get install -y podman
    info "podman installed: $(podman --version)"
fi

# ── podman-compose ────────────────────────────────────────────────────────────
if has podman-compose; then
    info "podman-compose already installed: $(podman-compose --version)"
else
    info "Installing podman-compose..."
    if ! has pip3; then
        sudo apt-get install -y python3-pip
    fi
    pip3 install --user podman-compose

    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        warn "~/.local/bin is not in your PATH."
        warn "Add the following to your shell profile and restart your terminal:"
        warn "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi

    info "podman-compose installed: $(podman-compose --version)"
fi

# ── node / npm ────────────────────────────────────────────────────────────────
if has node && has npm; then
    info "node already installed: $(node --version)"
    info "npm already installed:  $(npm --version)"
else
    info "Installing nodejs and npm..."
    sudo apt-get install -y nodejs npm
    info "node installed: $(node --version)"
    info "npm installed:  $(npm --version)"
fi

# ── java / maven (backend) ────────────────────────────────────────────────────
if has java; then
    info "java already installed: $(java --version 2>&1 | head -1)"
else
    info "Installing OpenJDK 21..."
    sudo apt-get install -y openjdk-25-jdk
    info "java installed: $(java --version 2>&1 | head -1)"
fi

if has mvn; then
    info "maven already installed: $(mvn --version | head -1)"
else
    info "Installing Maven..."
    sudo apt-get install -y maven
    info "maven installed: $(mvn --version | head -1)"
fi

info "Fetching backend dependencies..."
mvn -f "$PROJECT_ROOT/backend/pom.xml" dependency:go-offline -q
info "Backend dependencies ready."

# ── frontend modules ──────────────────────────────────────────────────────────
info "Installing frontend dependencies..."
npm install --prefix "$PROJECT_ROOT/frontend"
info "Frontend dependencies ready."

info "All dependencies satisfied. Run 'npm run dev' to start."
