FROM python:3.11-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv pip install --system --no-cache -r pyproject.toml 2>/dev/null || \
    pip install --no-cache-dir "mcp[cli]>=1.6.0" httpx requests

COPY . .

ENV MCP_TRANSPORT=sse
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8001
ENV DB_PATH=/app/store/messages.db
ENV BRIDGE_URL=http://bridge:8080

EXPOSE 8001

CMD ["python", "main.py"]
