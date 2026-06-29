#!/bin/bash
set -e

echo "=== WhatsApp MCP Server Setup ==="

# ── 1. System deps ──────────────────────────────────────────────
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq git curl wget ffmpeg sqlite3

# ── 2. Go ───────────────────────────────────────────────────────
echo "[2/7] Installing Go..."
GO_VERSION="1.22.4"
wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
rm -rf /usr/local/go
tar -C /usr/local -xzf /tmp/go.tar.gz
rm /tmp/go.tar.gz
export PATH=$PATH:/usr/local/go/bin
echo 'export PATH=$PATH:/usr/local/go/bin' >> /root/.bashrc

# ── 3. Python via uv ────────────────────────────────────────────
echo "[3/7] Installing uv (Python manager)..."
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.cargo/bin:$PATH"
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> /root/.bashrc

# ── 4. Clone repo ───────────────────────────────────────────────
echo "[4/7] Cloning repo..."
INSTALL_DIR="/opt/whatsapp-mcp"
if [ -d "$INSTALL_DIR" ]; then
    echo "Directory already exists, pulling latest..."
    cd "$INSTALL_DIR" && git pull
else
    git clone https://github.com/Viprasol-Tech/whatsapp-mcp.git "$INSTALL_DIR"
fi

# ── 5. Build Go bridge ──────────────────────────────────────────
echo "[5/7] Building Go bridge..."
cd "$INSTALL_DIR/whatsapp-bridge"
/usr/local/go/bin/go mod download
/usr/local/go/bin/go build -o whatsapp-bridge .
echo "Go bridge built successfully."

# ── 6. Install Python deps ──────────────────────────────────────
echo "[6/7] Installing Python dependencies..."
cd "$INSTALL_DIR/whatsapp-mcp-server"
~/.cargo/bin/uv sync

# ── 7. Create systemd service for Go bridge ─────────────────────
echo "[7/7] Creating systemd service..."
cat > /etc/systemd/system/whatsapp-bridge.service << 'EOF'
[Unit]
Description=WhatsApp MCP Bridge
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/whatsapp-mcp/whatsapp-bridge
ExecStart=/opt/whatsapp-mcp/whatsapp-bridge/whatsapp-bridge
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable whatsapp-bridge

echo ""
echo "======================================================"
echo "  Setup complete!"
echo ""
echo "  NEXT STEPS:"
echo "  1. Start the bridge and scan QR code:"
echo "     systemctl start whatsapp-bridge"
echo "     journalctl -u whatsapp-bridge -f"
echo ""
echo "  2. Scan the QR code with your WhatsApp"
echo "     (Settings > Linked Devices > Link a Device)"
echo ""
echo "  3. After scanning, install Claude Code:"
echo "     npm install -g @anthropic-ai/claude-code"
echo ""
echo "  4. Configure MCP (run as root):"
echo "     bash /opt/whatsapp-mcp/deploy/configure-mcp.sh"
echo "======================================================"
