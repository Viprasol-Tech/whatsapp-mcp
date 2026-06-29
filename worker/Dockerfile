FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY auto_reply.py .

CMD ["python", "-u", "auto_reply.py"]
