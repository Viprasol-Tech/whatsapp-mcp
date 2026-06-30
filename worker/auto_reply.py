"""
auto_reply.py — WhatsApp auto-reply + lead qualification + follow-up worker.

Flow per lead:
  1. Instant reply — greet and ask 1-2 qualifying questions
  2. Progressive qualification — platform, strategy, budget, timeline
  3. Objection handling — pricing, "I'll think about it", comparisons
  4. Hot lead detection — notify human when buying signals confirmed
  5. Within-session follow-up — if lead goes quiet 3h after our reply (still inside 24h window)
"""

import json
import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import requests
from openai import OpenAI

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BRIDGE_URL      = os.getenv("BRIDGE_URL", "http://bridge:8080")
DB_PATH         = os.getenv("DB_PATH", "/app/store/messages.db")
CLAUDE_PROXY_URL = os.getenv("CLAUDE_PROXY_URL", "http://172.17.0.1:3456/v1")
MY_JID          = os.getenv("MY_JID", "919633652112@s.whatsapp.net")
AUTO_REPLY_ENABLED = os.getenv("AUTO_REPLY_ENABLED", "true").lower() == "true"

MODEL                      = "claude-haiku-4"
POLL_INTERVAL_SECONDS      = 30
LOOKBACK_MINUTES           = 5
MIN_SEND_INTERVAL_SECONDS  = 5
RATE_LIMIT_MINUTES         = 2        # max 1 auto-reply per chat per N min
FOLLOWUP_AFTER_HOURS       = 3        # send follow-up if lead silent for 3h after our reply
FOLLOWUP_WINDOW_HOURS      = 22       # only follow up if still within 22h of lead's last message

# Load system prompt from file or use built-in
_prompt_file = os.getenv("SYSTEM_PROMPT_FILE")
if _prompt_file and os.path.exists(_prompt_file):
    with open(_prompt_file) as _f:
        SYSTEM_PROMPT = _f.read().strip()
else:
    SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT") or ""

if not SYSTEM_PROMPT:
    SYSTEM_PROMPT = (
        "You are a WhatsApp sales assistant for Viprasol Tech (viprasol.com). "
        "Viprasol builds professional trading bots and algo systems. Reply in 2-3 sentences max."
    )

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            log_obj["exc"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)

_handler = logging.StreamHandler()
_handler.setFormatter(JsonFormatter())
logging.basicConfig(handlers=[_handler], level=logging.INFO, force=True)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

MY_PHONE = MY_JID.split("@")[0]


@contextmanager
def db_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def ensure_tables() -> None:
    with db_conn() as conn:
        conn.executescript("""
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

            CREATE TABLE IF NOT EXISTS lead_state (
                chat_jid        TEXT PRIMARY KEY,
                stage           TEXT DEFAULT 'new',
                platform        TEXT,
                strategy_type   TEXT,
                budget_range    TEXT,
                timeline        TEXT,
                is_hot          INTEGER DEFAULT 0,
                last_auto_reply TEXT,
                followup_sent   INTEGER DEFAULT 0,
                updated_at      TEXT
            );
        """)
        conn.commit()
    log.info("DB tables ensured.")


# ---------------------------------------------------------------------------
# Lead state helpers
# ---------------------------------------------------------------------------

def get_lead_state(chat_jid: str) -> dict:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT * FROM lead_state WHERE chat_jid = ?", (chat_jid,)
        ).fetchone()
    if row:
        return dict(row)
    return {"chat_jid": chat_jid, "stage": "new", "platform": None,
            "strategy_type": None, "budget_range": None, "timeline": None,
            "is_hot": 0, "last_auto_reply": None, "followup_sent": 0}


def save_lead_state(state: dict) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    with db_conn() as conn:
        conn.execute("""
            INSERT INTO lead_state
                (chat_jid, stage, platform, strategy_type, budget_range, timeline,
                 is_hot, last_auto_reply, followup_sent, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(chat_jid) DO UPDATE SET
                stage          = excluded.stage,
                platform       = excluded.platform,
                strategy_type  = excluded.strategy_type,
                budget_range   = excluded.budget_range,
                timeline       = excluded.timeline,
                is_hot         = excluded.is_hot,
                last_auto_reply= excluded.last_auto_reply,
                followup_sent  = excluded.followup_sent,
                updated_at     = excluded.updated_at
        """, (
            state["chat_jid"], state.get("stage", "new"),
            state.get("platform"), state.get("strategy_type"),
            state.get("budget_range"), state.get("timeline"),
            int(state.get("is_hot", 0)),
            state.get("last_auto_reply"), int(state.get("followup_sent", 0)), now
        ))
        conn.commit()


# ---------------------------------------------------------------------------
# Guard helpers
# ---------------------------------------------------------------------------

def is_chat_paused(jid: str) -> bool:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM paused_chats WHERE jid = ? OR jid = '*'", (jid,)
        ).fetchone()
    return row is not None


def already_replied(message_id: str, chat_jid: str) -> bool:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM auto_replies WHERE message_id = ? AND chat_jid = ?",
            (message_id, chat_jid),
        ).fetchone()
    return row is not None


def replied_recently(chat_jid: str) -> bool:
    cutoff = (
        datetime.now(tz=timezone.utc) - timedelta(minutes=RATE_LIMIT_MINUTES)
    ).isoformat()
    with db_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM auto_replies WHERE chat_jid = ? AND replied_at > ? AND status = 'sent'",
            (chat_jid, cutoff),
        ).fetchone()
    return row is not None


def last_message_is_mine(chat_jid: str) -> bool:
    with db_conn() as conn:
        row = conn.execute(
            "SELECT is_from_me FROM messages WHERE chat_jid = ? ORDER BY datetime(timestamp) DESC LIMIT 1",
            (chat_jid,),
        ).fetchone()
    return bool(row["is_from_me"]) if row else False


def get_last_inbound_time(chat_jid: str):
    """Returns the timestamp of the most recent message FROM the lead."""
    with db_conn() as conn:
        row = conn.execute(
            "SELECT timestamp FROM messages WHERE chat_jid = ? AND is_from_me = 0 ORDER BY datetime(timestamp) DESC LIMIT 1",
            (chat_jid,),
        ).fetchone()
    return row["timestamp"] if row else None


def _cutoff(minutes: int) -> str:
    """Return cutoff timestamp in the same space-format the bridge uses."""
    return (
        datetime.now(tz=timezone.utc) - timedelta(minutes=minutes)
    ).strftime("%Y-%m-%d %H:%M:%S")


def get_recent_inbound_messages():
    cutoff = _cutoff(LOOKBACK_MINUTES)
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, chat_jid, sender, content, timestamp
            FROM messages
            WHERE is_from_me = 0
              AND content != ''
              AND datetime(timestamp) > datetime(?)
            ORDER BY timestamp ASC
            """,
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_context_messages(chat_jid: str, limit: int = 8) -> list:
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT sender, content, is_from_me, timestamp
            FROM messages
            WHERE chat_jid = ? AND content != ''
            ORDER BY datetime(timestamp) DESC
            LIMIT ?
            """,
            (chat_jid, limit),
        ).fetchall()
    return list(reversed([dict(r) for r in rows]))


def log_reply(message_id: str, chat_jid: str, reply_text: str, status: str) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    with db_conn() as conn:
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
# Claude — sales assistant with full qualification + objection handling
# ---------------------------------------------------------------------------

FULL_SYSTEM_PROMPT = SYSTEM_PROMPT + """

CONVERSATION FLOW:

OPENING (first reply — always):
Use this format, naturally adapted to their language:

"Hi Sir! 👋
Welcome to *Viprasol Tech* — your trading automation partner.

Are you exploring our services, or do you already have something specific in mind?"

If they write in Hindi, open in Hindi. Keep it short and welcoming.

STAGE 2 — UNDERSTAND REQUIREMENT:
- Read what they said carefully. Ask ONE focused question based on their exact words.
- Match their need to our service. Never assume — ask first.
- One question per message. No lists. No essays.
- Good follow-ups (pick only what's relevant):
  • "Which platform — MT4, MT5, or a crypto exchange like Binance/Bybit?"
  • "Do you have a strategy ready to code, or need it built from scratch?"
  • "Is this for a live account or a prop firm challenge?"
  • "Which instrument — Gold, indices like US30, or crypto?"

STAGE 3 — PRICING (when lead asks: cost / price / how much / fees / charges):
  Reply EXACTLY: "Let me get the exact pricing for your requirements — our team will share it shortly! 🙏"
  Then add [PAUSE_FOR_BUDGET] at the end.
  Do NOT quote any number. Do NOT say "it depends". Stop here.

STAGE 4 — HOT LEAD (lead says "let's start" / "send quote" / "when can you begin"):
  Reply: "Great! Connecting you with our senior engineer now — they'll share the full scope and timeline shortly. 🙏"
  Then add [HOT_LEAD] at the end.

OBJECTION — "I'll think about it":
  "Of course! If there's any specific question — timeline, what's included, or live results — happy to help right now."

OBJECTION — "saw cheaper elsewhere":
  "Totally fair. With Viprasol: senior engineers only, forward-tested before delivery, 1000+ projects. What platform were you quoted for?"

STRICT RULES:
- MAX 3 lines per reply. No long paragraphs.
- ONE question per message — never two.
- Never bring up budget/price yourself.
- Never say "As an AI", "I'm Claude", or anything robotic.
- Stick only to their requirement and our services. No off-topic chat.
- Reply in the same language the lead uses (Hindi or English).
"""

FOLLOWUP_SYSTEM_PROMPT = SYSTEM_PROMPT + """
You are sending a gentle follow-up to a lead who has gone quiet after showing interest.
The follow-up must feel natural, not pushy. One or two sentences maximum.
Reference something specific from the last exchange.
Offer a simple next step: see live results, free consultation, or just ask if they have questions.
Do NOT repeat what you already said. Make it feel like a friendly check-in.
Reply in the same language as the conversation.
"""


_openai_client = None


def get_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key="dummy", base_url=CLAUDE_PROXY_URL)
    return _openai_client


def call_claude(context_msgs: list, new_message: str, system_override: str = None) -> str:
    client = get_client()
    system = system_override or FULL_SYSTEM_PROMPT
    messages = [{"role": "system", "content": system}]
    for m in context_msgs:
        role = "assistant" if m["is_from_me"] else "user"
        messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": new_message})

    MAX_RETRIES = 3
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                max_tokens=300,
                messages=messages,
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                log.error("call_claude failed after %d attempts: %s", MAX_RETRIES, e)
                raise
            wait = 2 ** attempt  # 1s, 2s, 4s
            log.warning("call_claude attempt %d failed: %s, retrying in %ds", attempt + 1, e, wait)
            time.sleep(wait)


# ---------------------------------------------------------------------------
# Lead state extraction from Claude reply
# ---------------------------------------------------------------------------

def auto_pause_chat(chat_jid: str) -> None:
    """Insert this chat into paused_chats so the human can take over."""
    now = datetime.now(tz=timezone.utc).isoformat()
    with db_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO paused_chats (jid, paused_at) VALUES (?, ?)",
            (chat_jid, now),
        )
        conn.commit()
    log.info("Chat %s AUTO-PAUSED — waiting for human to handle budget.", chat_jid)


def extract_lead_signals(reply: str, state: dict) -> dict:
    """Parse internal markers and update stage in state dict."""
    updated = dict(state)

    if "[HOT_LEAD]" in reply:
        updated["is_hot"] = 1
        updated["stage"] = "hot"
        log.info("HOT LEAD detected in chat %s — needs human follow-up!", state.get("chat_jid"))

    if "[PAUSE_FOR_BUDGET]" in reply:
        updated["stage"] = "budget_pending"
        auto_pause_chat(updated["chat_jid"])

    # Stage progression
    if updated["stage"] == "new":
        updated["stage"] = "contacted"
    elif updated["stage"] == "contacted":
        updated["stage"] = "qualifying"

    return updated


# ---------------------------------------------------------------------------
# Send via bridge
# ---------------------------------------------------------------------------

_last_send_time = 0.0


def store_outgoing(chat_jid: str, message: str) -> None:
    """Store the bot's outgoing message in messages table so context is preserved."""
    now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00:00")
    msg_id = "bot-{}-{:.6f}".format(chat_jid[:8], time.time())
    with db_conn() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO messages
                (id, chat_jid, sender, content, timestamp, is_from_me)
            VALUES (?, ?, ?, ?, ?, 1)
            """,
            (msg_id, chat_jid, MY_PHONE, message, now),
        )
        conn.commit()


def send_via_bridge(recipient: str, message: str) -> None:
    global _last_send_time
    elapsed = time.monotonic() - _last_send_time
    if elapsed < MIN_SEND_INTERVAL_SECONDS:
        time.sleep(MIN_SEND_INTERVAL_SECONDS - elapsed)

    # Strip internal markers before sending
    clean_msg = message.replace("[HOT_LEAD]", "").replace("[PAUSE_FOR_BUDGET]", "").strip()

    resp = requests.post(
        "{}/api/send".format(BRIDGE_URL),
        json={"recipient": recipient, "message": clean_msg},
        timeout=15,
    )
    _last_send_time = time.monotonic()
    resp.raise_for_status()
    data = resp.json()
    if not data.get("success"):
        raise RuntimeError("Bridge returned failure: {}".format(data.get("message")))

    # Store outgoing message so get_context_messages() sees the full conversation
    store_outgoing(recipient, clean_msg)


# ---------------------------------------------------------------------------
# Main reply handler
# ---------------------------------------------------------------------------

def process_message(msg: dict) -> None:
    # Skip media/non-text messages
    if not msg.get('content') or not str(msg.get('content', '')).strip():
        return
    content = str(msg['content'])
    if content.startswith('[') and content.endswith(']'):
        # Likely a media placeholder like [image] [video] [document]
        return

    message_id = msg["id"]
    chat_jid   = msg["chat_jid"]

    if is_chat_paused(chat_jid):
        log.debug("Chat %s paused — skipping.", chat_jid)
        return

    if already_replied(message_id, chat_jid):
        log.debug("Already replied to %s — skipping.", message_id)
        return

    if last_message_is_mine(chat_jid):
        log.debug("Last msg in %s is mine — skipping.", chat_jid)
        return

    if replied_recently(chat_jid):
        log.debug("Rate-limited for %s — skipping.", chat_jid)
        return

    log.info("Processing msg %s in %s: %.60s", message_id, chat_jid, content)

    state        = get_lead_state(chat_jid)
    context_msgs = get_context_messages(chat_jid, limit=8)

    try:
        reply_text = call_claude(context_msgs, content)
    except RuntimeError as e:
        log.error("Claude error for %s: %s", message_id, e)
        log_reply(message_id, chat_jid, "", "error")
        return

    # Update lead state based on reply
    state = extract_lead_signals(reply_text, state)
    state["last_auto_reply"] = datetime.now(tz=timezone.utc).isoformat()
    state["followup_sent"]   = 0  # reset — lead is active again
    save_lead_state(state)

    log.info("Reply for %s: %.100s", chat_jid, reply_text)

    try:
        send_via_bridge(chat_jid, reply_text)
        log_reply(message_id, chat_jid, reply_text, "sent")
        log.info("Sent reply to %s (stage: %s, hot: %s).",
                 chat_jid, state.get("stage"), bool(state.get("is_hot")))
    except Exception as e:
        log.error("Bridge error for %s: %s", chat_jid, e)
        log_reply(message_id, chat_jid, reply_text, "send_failed")


# ---------------------------------------------------------------------------
# Within-session follow-up
# ---------------------------------------------------------------------------

def run_followups() -> None:
    """
    For each lead we replied to but who hasn't responded:
    - If >= FOLLOWUP_AFTER_HOURS have passed since our last reply
    - AND their last inbound message was < FOLLOWUP_WINDOW_HOURS ago (still inside 24h window)
    - AND we haven't sent a follow-up yet for this exchange
    - AND chat is not paused
    - AND the last message is still ours (they haven't replied)
    → Send one gentle Claude-generated follow-up.
    """
    now = datetime.now(tz=timezone.utc)
    followup_cutoff = (now - timedelta(hours=FOLLOWUP_AFTER_HOURS)).isoformat()
    # window_cutoff compares against messages.timestamp which uses space format
    window_cutoff   = (now - timedelta(hours=FOLLOWUP_WINDOW_HOURS)).strftime("%Y-%m-%d %H:%M:%S")

    with db_conn() as conn:
        candidates = conn.execute(
            """
            SELECT * FROM lead_state
            WHERE last_auto_reply IS NOT NULL
              AND last_auto_reply < ?
              AND followup_sent = 0
              AND stage NOT IN ('hot', 'converted')
            """,
            (followup_cutoff,),
        ).fetchall()

    for row in candidates:
        state    = dict(row)
        chat_jid = state["chat_jid"]

        if is_chat_paused(chat_jid):
            continue

        # Lead's last inbound must still be within the 24h window
        last_inbound = get_last_inbound_time(chat_jid)
        if not last_inbound or last_inbound < window_cutoff:
            log.debug("Follow-up skipped for %s — outside 24h window.", chat_jid)
            continue

        # Only follow up if the last message in the chat is still ours
        if not last_message_is_mine(chat_jid):
            # Lead replied — clear follow-up flag
            state["followup_sent"] = 1
            save_lead_state(state)
            continue

        log.info("Sending follow-up to quiet lead %s (last reply: %s).",
                 chat_jid, state.get("last_auto_reply"))

        context_msgs = get_context_messages(chat_jid, limit=6)

        try:
            followup_text = call_claude(
                context_msgs,
                "[Generate a brief, friendly follow-up. The lead hasn't responded yet. "
                "Reference the last topic discussed. Ask one simple question or offer a next step.]",
                system_override=FOLLOWUP_SYSTEM_PROMPT,
            )
        except RuntimeError as e:
            log.error("Claude follow-up error for %s: %s", chat_jid, e)
            continue

        try:
            send_via_bridge(chat_jid, followup_text)
            # Mark follow-up sent and log it
            state["followup_sent"] = 1
            save_lead_state(state)
            log_reply(
                "followup-{}".format(chat_jid),
                chat_jid,
                followup_text,
                "sent",
            )
            log.info("Follow-up sent to %s: %.80s", chat_jid, followup_text)
        except Exception as e:
            log.error("Follow-up bridge error for %s: %s", chat_jid, e)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def run_once() -> None:
    if not AUTO_REPLY_ENABLED:
        log.debug("AUTO_REPLY_ENABLED=false — idle.")
        return

    # 1. Handle new inbound messages
    messages = get_recent_inbound_messages()
    if messages:
        log.info("Found %d inbound message(s) to evaluate.", len(messages))
        for msg in messages:
            try:
                process_message(msg)
            except Exception as e:
                log.exception("Error processing message %s: %s", msg.get("id"), e)

    # 2. Send within-session follow-ups to quiet leads
    try:
        run_followups()
    except Exception as e:
        log.exception("Error in follow-up pass: %s", e)


def main() -> None:
    log.info("Auto-reply worker starting. MY_JID=%s, BRIDGE_URL=%s", MY_JID, BRIDGE_URL)
    ensure_tables()

    _loop_count = 0
    while True:
        try:
            run_once()
        except Exception as e:
            log.exception("Unhandled error in poll cycle: %s", e)
        _loop_count += 1
        if _loop_count % 100 == 0:
            try:
                with db_conn() as conn:
                    conn.execute(
                        "DELETE FROM auto_replies WHERE replied_at < datetime('now', '-7 days')"
                    )
                    conn.commit()
                log.info("Trimmed auto_replies older than 7 days (loop %d).", _loop_count)
            except Exception as e:
                log.warning("Failed to trim auto_replies: %s", e)
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
