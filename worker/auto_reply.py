"""
auto_reply.py — WhatsApp auto-reply worker.

Polls SQLite every 30 seconds for new inbound messages, generates replies
via the Claude API, and sends them through the Go bridge.
"""

import logging
import os
import sqlite3
import time
from datetime import datetime, timedelta, timezone

import anthropic
import requests

# ---------------------------------------------------------------------------
# Configuration (env vars)
# ---------------------------------------------------------------------------

BRIDGE_URL = os.getenv("BRIDGE_URL", "http://bridge:8080")
DB_PATH = os.getenv("DB_PATH", "/app/store/messages.db")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MY_JID = os.getenv("MY_JID", "919633652112@s.whatsapp.net")
AUTO_REPLY_ENABLED = os.getenv("AUTO_REPLY_ENABLED", "true").lower() == "true"

_DEFAULT_SYSTEM_PROMPT = (
    "You are a WhatsApp assistant for a trading EA (Expert Advisor) business. "
    "Reply professionally and helpfully to potential clients. "
    "Business context: We sell automated trading systems (EAs) for MT4/MT5 platforms, "
    "specializing in Gold (XAUUSD), US30, NAS100. "
    "Keep replies short (2-3 sentences max). Be friendly and professional. "
    "If someone asks about pricing, say you'll share details and ask for their preferred platform (MT4/MT5). "
    "If someone asks about results/performance, say you have live results and ask if they want to see them. "
    "Never make specific profit guarantees."
)

SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT") or _DEFAULT_SYSTEM_PROMPT

MODEL = "claude-haiku-4-5-20251001"
POLL_INTERVAL_SECONDS = 30
LOOKBACK_MINUTES = 5
MIN_SEND_INTERVAL_SECONDS = 5
MAX_REPLIES_PER_CHAT_MINUTES = 10

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("auto_reply")

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

MY_PHONE = MY_JID.split("@")[0]  # e.g. "919633652112"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_tables() -> None:
    """Create worker-specific tables if they don't exist."""
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS auto_replies (
                message_id  TEXT,
                chat_jid    TEXT,
                replied_at  TEXT,
                reply_text  TEXT,
                status      TEXT,
                PRIMARY KEY (message_id, chat_jid)
            );

            CREATE TABLE IF NOT EXISTS paused_chats (
                jid         TEXT PRIMARY KEY,
                paused_at   TEXT
            );
            """
        )
        conn.commit()
    log.info("DB tables ensured.")


def is_chat_paused(jid: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM paused_chats WHERE jid = ? OR jid = '*'", (jid,)
        ).fetchone()
    return row is not None


def already_replied(message_id: str, chat_jid: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM auto_replies WHERE message_id = ? AND chat_jid = ?",
            (message_id, chat_jid),
        ).fetchone()
    return row is not None


def replied_recently(chat_jid: str) -> bool:
    """Return True if we auto-replied to this chat within the rate-limit window."""
    cutoff = (
        datetime.now(tz=timezone.utc) - timedelta(minutes=MAX_REPLIES_PER_CHAT_MINUTES)
    ).isoformat()
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT 1 FROM auto_replies
            WHERE chat_jid = ? AND replied_at > ? AND status = 'sent'
            """,
            (chat_jid, cutoff),
        ).fetchone()
    return row is not None


def last_message_is_mine(chat_jid: str) -> bool:
    """Return True if the most recent message in this chat was sent by me."""
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT is_from_me FROM messages
            WHERE chat_jid = ?
            ORDER BY timestamp DESC
            LIMIT 1
            """,
            (chat_jid,),
        ).fetchone()
    if row is None:
        return False
    return bool(row["is_from_me"])


def get_recent_inbound_messages():
    """Return messages received in the last LOOKBACK_MINUTES that are not from me."""
    cutoff = (
        datetime.now(tz=timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES)
    ).isoformat()
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, chat_jid, sender, content, timestamp
            FROM messages
            WHERE is_from_me = 0
              AND content != ''
              AND timestamp > ?
            ORDER BY timestamp ASC
            """,
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_context_messages(chat_jid: str, limit: int = 5) -> list:
    """Return the last `limit` messages from a chat for Claude context."""
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT sender, content, is_from_me, timestamp
            FROM messages
            WHERE chat_jid = ? AND content != ''
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (chat_jid, limit),
        ).fetchall()
    return list(reversed([dict(r) for r in rows]))


def log_reply(
    message_id: str, chat_jid: str, reply_text: str, status: str
) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO auto_replies
                (message_id, chat_jid, replied_at, reply_text, status)
            VALUES (?, ?, ?, ?, ?)
            """,
            (message_id, chat_jid, now, reply_text, status),
        )
        conn.commit()


# ---------------------------------------------------------------------------
# Claude API
# ---------------------------------------------------------------------------

_anthropic_client = None


def get_anthropic_client():
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return _anthropic_client


def build_claude_messages(context_msgs: list, new_message: str) -> list:
    """Build the messages list for the Claude API call."""
    messages = []
    for m in context_msgs:
        role = "assistant" if m["is_from_me"] else "user"
        messages.append({"role": role, "content": m["content"]})

    # Ensure the conversation ends with the new inbound message (user role).
    messages.append({"role": "user", "content": new_message})
    return messages


def call_claude(context_msgs: list, new_message: str) -> str:
    """Call Claude API; retry once on failure. Returns reply text."""
    client = get_anthropic_client()
    messages = build_claude_messages(context_msgs, new_message)

    def _call():
        response = client.messages.create(
            model=MODEL,
            max_tokens=256,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
        return response.content[0].text.strip()

    try:
        return _call()
    except Exception as e:
        log.warning("Claude API error (will retry once in 5 s): %s", e)
        time.sleep(5)
        try:
            return _call()
        except Exception as e2:
            raise RuntimeError("Claude API failed after retry: {}".format(e2)) from e2


# ---------------------------------------------------------------------------
# Bridge sender
# ---------------------------------------------------------------------------

_last_send_time = 0.0


def send_via_bridge(recipient: str, message: str) -> None:
    """POST to the Go bridge to send a WhatsApp message."""
    global _last_send_time

    # Enforce minimum interval between any two sends
    elapsed = time.monotonic() - _last_send_time
    if elapsed < MIN_SEND_INTERVAL_SECONDS:
        time.sleep(MIN_SEND_INTERVAL_SECONDS - elapsed)

    resp = requests.post(
        "{}/api/send".format(BRIDGE_URL),
        json={"recipient": recipient, "message": message},
        timeout=15,
    )
    _last_send_time = time.monotonic()
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError("Bridge returned failure: {}".format(data.get("message")))


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def process_message(msg: dict) -> None:
    message_id = msg["id"]
    chat_jid = msg["chat_jid"]
    content = msg["content"]

    # Skip if chat is paused
    if is_chat_paused(chat_jid):
        log.debug("Chat %s is paused — skipping.", chat_jid)
        return

    # Skip if already replied
    if already_replied(message_id, chat_jid):
        log.debug("Already replied to message %s — skipping.", message_id)
        return

    # Skip if last message in chat is from me (human already replied)
    if last_message_is_mine(chat_jid):
        log.debug("Last message in %s is mine — human replied, skipping.", chat_jid)
        return

    # Rate limit: max 1 auto-reply per chat per 10 minutes
    if replied_recently(chat_jid):
        log.debug("Rate-limited: already replied to %s recently.", chat_jid)
        return

    log.info("Processing message %s in chat %s: %.60s", message_id, chat_jid, content)

    # Build context
    context_msgs = get_context_messages(chat_jid, limit=5)

    # Call Claude
    try:
        reply_text = call_claude(context_msgs, content)
    except RuntimeError as e:
        log.error("Claude error for message %s: %s", message_id, e)
        log_reply(message_id, chat_jid, "", "error")
        return

    log.info("Reply for %s: %.80s", chat_jid, reply_text)

    # Send via bridge
    try:
        send_via_bridge(chat_jid, reply_text)
        log_reply(message_id, chat_jid, reply_text, "sent")
        log.info("Sent auto-reply to %s.", chat_jid)
    except Exception as e:
        log.error("Bridge send error for %s: %s", chat_jid, e)
        log_reply(message_id, chat_jid, reply_text, "send_failed")


def run_once() -> None:
    """One poll cycle."""
    if not AUTO_REPLY_ENABLED:
        log.debug("AUTO_REPLY_ENABLED=false — idle.")
        return

    messages = get_recent_inbound_messages()
    if not messages:
        log.debug("No new inbound messages.")
        return

    log.info("Found %d inbound message(s) to evaluate.", len(messages))
    for msg in messages:
        try:
            process_message(msg)
        except Exception as e:
            log.exception("Unexpected error processing message %s: %s", msg.get("id"), e)


def main() -> None:
    log.info("Auto-reply worker starting. MY_JID=%s, BRIDGE_URL=%s", MY_JID, BRIDGE_URL)
    ensure_tables()

    while True:
        try:
            run_once()
        except Exception as e:
            log.exception("Unhandled error in poll cycle: %s", e)
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
