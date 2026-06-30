#!/bin/bash
# Quick health check for all containers
# Usage: bash deploy/healthcheck.sh
set -e

echo "=== WhatsApp MCP Health Check ==="
echo ""

check_service() {
  local name=$1
  local url=$2
  if curl -sf "$url" > /dev/null 2>&1; then
    echo "✓ $name: OK"
  else
    echo "✗ $name: FAILED ($url)"
  fi
}

echo "Container status:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"

echo ""
echo "Endpoint checks:"
check_service "nginx/frontend" "http://localhost/health"
check_service "api" "http://localhost/api/status"
check_service "bridge" "http://localhost:8080/status"

echo ""
echo "Worker logs (last 5 lines):"
docker compose logs worker --tail=5 2>/dev/null || echo "(worker not running)"
