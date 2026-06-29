#!/bin/bash
# Adds the WhatsApp MCP server to Claude Code's config

CONFIG_DIR="$HOME/.claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
UV_PATH=$(which uv || echo "$HOME/.cargo/bin/uv")

mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "whatsapp": {
      "command": "$UV_PATH",
      "args": [
        "--directory",
        "/opt/whatsapp-mcp/whatsapp-mcp-server",
        "run",
        "main.py"
      ]
    }
  }
}
EOF

echo "MCP configured at $CONFIG_FILE"
echo "Run 'claude' to start Claude Code with WhatsApp MCP."
