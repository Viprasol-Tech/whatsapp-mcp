#!/bin/bash
# Configures Claude to connect to the WhatsApp MCP server running in Docker via SSE.
# Usage:  ./configure-mcp.sh [server-ip]
# Default server-ip is localhost (for local testing).

SERVER_IP="${1:-localhost}"
MCP_URL="http://${SERVER_IP}:8001/sse"

CONFIG_DIR="$HOME/.claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "whatsapp": {
      "url": "${MCP_URL}"
    }
  }
}
EOF

echo "MCP configured at $CONFIG_FILE"
echo "Claude will connect to: ${MCP_URL}"
echo ""
echo "Run 'claude' to start Claude Code with WhatsApp MCP."
