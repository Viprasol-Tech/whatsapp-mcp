import asyncio
import csv
import io
import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, List

import httpx
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_PATH = os.getenv("DB_PATH", "/app/store/messages.db")
BRIDGE_URL = os.getenv("BRIDGE_URL", "http://localhost:8080")
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "admin123")
SECRET_KEY = os.getenv("SECRET_KEY", "changeme_use_a_long_random_string")
if SECRET_KEY == "changeme_use_a_long_random_string":
    import sys
    print(
        "WARNING: SECRET_KEY is using the insecure default value. "
        "Set the SECRET_KEY environment variable before deploying to production.",
        file=sys.stderr,
    )
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="WhatsApp MCP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://187.77.219.244", "https://187.77.219.244"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)


def _create_token() -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def _verify_token(credentials: Optional[HTTPAuthorizationCredentials]) -> None:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> None:
    _verify_token(credentials)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Message:
    timestamp: datetime
    sender: str
    content: str
    is_from_me: bool
    chat_jid: str
    id: str
    chat_name: Optional[str] = None
    media_type: Optional[str] = None


@dataclass
class Chat:
    jid: str
    name: Optional[str]
    last_message_time: Optional[datetime]
    last_message: Optional[str] = None
    last_sender: Optional[str] = None
    last_is_from_me: Optional[bool] = None

    @property
    def is_group(self) -> bool:
        return self.jid.endswith("@g.us")


@dataclass
class Contact:
    phone_number: str
    name: Optional[str]
    jid: str


# ---------------------------------------------------------------------------
# DB helpers (sync — called via asyncio.to_thread)
# ---------------------------------------------------------------------------

def _get_sender_name(sender_jid: str) -> str:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM chats WHERE jid = ? LIMIT 1", (sender_jid,))
        result = cursor.fetchone()
        if not result:
            phone_part = sender_jid.split("@")[0] if "@" in sender_jid else sender_jid
            cursor.execute(
                "SELECT name FROM chats WHERE jid LIKE ? LIMIT 1",
                (f"%{phone_part}%",),
            )
            result = cursor.fetchone()
        return result[0] if result and result[0] else sender_jid
    except sqlite3.Error:
        return sender_jid
    finally:
        if "conn" in dir():
            conn.close()


def _format_message(msg: Message, show_chat_info: bool = True) -> str:
    output = ""
    if show_chat_info and msg.chat_name:
        output += f"[{msg.timestamp:%Y-%m-%d %H:%M:%S}] Chat: {msg.chat_name} "
    else:
        output += f"[{msg.timestamp:%Y-%m-%d %H:%M:%S}] "

    content_prefix = ""
    if msg.media_type:
        content_prefix = f"[{msg.media_type} - Message ID: {msg.id} - Chat JID: {msg.chat_jid}] "

    sender_name = "Me" if msg.is_from_me else _get_sender_name(msg.sender)
    output += f"From: {sender_name}: {content_prefix}{msg.content}\n"
    return output


def _format_messages_list(messages: List[Message], show_chat_info: bool = True) -> str:
    if not messages:
        return "No messages to display."
    return "".join(_format_message(m, show_chat_info) for m in messages)


def _db_list_chats(
    query: Optional[str] = None,
    limit: int = 20,
    page: int = 0,
) -> List[dict]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        sql = """
            SELECT
                chats.jid,
                chats.name,
                chats.last_message_time,
                m.content   AS last_message,
                m.sender    AS last_sender,
                m.is_from_me AS last_is_from_me
            FROM chats
            LEFT JOIN messages m
                ON m.id = (
                    SELECT id FROM messages
                    WHERE chat_jid = chats.jid
                    ORDER BY datetime(timestamp) DESC
                    LIMIT 1
                )
        """
        params: list = []
        if query:
            sql += " WHERE (LOWER(chats.name) LIKE LOWER(?) OR chats.jid LIKE ?)"
            params.extend([f"%{query}%", f"%{query}%"])

        sql += " ORDER BY chats.last_message_time DESC LIMIT ? OFFSET ?"
        params.extend([limit, page * limit])

        cursor.execute(sql, params)
        rows = cursor.fetchall()

        result = []
        for row in rows:
            result.append(
                {
                    "jid": row[0],
                    "name": row[1],
                    "last_message_time": row[2],
                    "last_message": row[3],
                    "last_sender": row[4],
                    "last_is_from_me": bool(row[5]) if row[5] is not None else None,
                    "is_group": row[0].endswith("@g.us") if row[0] else False,
                }
            )
        return result
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_list_messages(
    chat_jid: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 20,
    page: int = 0,
    after: Optional[str] = None,
    before: Optional[str] = None,
) -> str:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        sql_parts = [
            """
            SELECT
                messages.timestamp,
                messages.sender,
                chats.name,
                messages.content,
                messages.is_from_me,
                chats.jid,
                messages.id,
                messages.media_type
            FROM messages
            JOIN chats ON messages.chat_jid = chats.jid
            """
        ]
        where: list[str] = []
        params: list = []

        if after:
            where.append("messages.timestamp > ?")
            params.append(after)
        if before:
            where.append("messages.timestamp < ?")
            params.append(before)
        if chat_jid:
            where.append("messages.chat_jid = ?")
            params.append(chat_jid)
        if query:
            where.append("LOWER(messages.content) LIKE LOWER(?)")
            params.append(f"%{query}%")

        if where:
            sql_parts.append("WHERE " + " AND ".join(where))

        sql_parts.append("ORDER BY messages.timestamp DESC LIMIT ? OFFSET ?")
        params.extend([limit, page * limit])

        cursor.execute(" ".join(sql_parts), params)
        rows = cursor.fetchall()

        messages = [
            Message(
                timestamp=datetime.fromisoformat(row[0]),
                sender=row[1],
                chat_name=row[2],
                content=row[3],
                is_from_me=bool(row[4]),
                chat_jid=row[5],
                id=row[6],
                media_type=row[7],
            )
            for row in rows
        ]

        return _format_messages_list(messages, show_chat_info=True)
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_search_contacts(q: str) -> List[dict]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        pattern = f"%{q}%"
        cursor.execute(
            """
            SELECT DISTINCT jid, name
            FROM chats
            WHERE (LOWER(name) LIKE LOWER(?) OR LOWER(jid) LIKE LOWER(?))
              AND jid NOT LIKE '%@g.us'
            ORDER BY name, jid
            LIMIT 50
            """,
            (pattern, pattern),
        )
        rows = cursor.fetchall()

        return [
            {
                "jid": row[0],
                "name": row[1],
                "phone_number": row[0].split("@")[0] if row[0] else "",
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Pydantic request bodies
# ---------------------------------------------------------------------------

class LoginBody(BaseModel):
    password: str


class SendMessageBody(BaseModel):
    recipient: str
    message: str


class SendFileBody(BaseModel):
    recipient: str
    media_path: str


class WorkerPauseBody(BaseModel):
    jid: str


class NotesUpdate(BaseModel):
    notes: str


# ---------------------------------------------------------------------------
# Worker DB helpers (sync)
# ---------------------------------------------------------------------------

def _db_worker_status() -> dict:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Ensure tables exist (worker may not have started yet)
        cursor.executescript(
            """
            CREATE TABLE IF NOT EXISTS auto_replies (
                message_id TEXT,
                chat_jid   TEXT,
                replied_at TEXT,
                reply_text TEXT,
                status     TEXT,
                PRIMARY KEY (message_id, chat_jid)
            );
            CREATE TABLE IF NOT EXISTS paused_chats (
                jid       TEXT PRIMARY KEY,
                paused_at TEXT
            );
            """
        )

        # Add notes column to lead_state if it doesn't exist yet
        try:
            conn.execute("ALTER TABLE lead_state ADD COLUMN notes TEXT DEFAULT ''")
            conn.commit()
        except Exception:
            pass  # column already exists

        cursor.execute("SELECT COUNT(*) FROM auto_replies WHERE status = 'sent'")
        total_replied = cursor.fetchone()[0]

        today = datetime.utcnow().strftime("%Y-%m-%d")
        cursor.execute(
            "SELECT COUNT(*) FROM auto_replies WHERE status = 'sent' AND replied_at LIKE ?",
            (f"{today}%",),
        )
        replies_today = cursor.fetchone()[0]

        cursor.execute(
            "SELECT replied_at FROM auto_replies WHERE status = 'sent' ORDER BY replied_at DESC LIMIT 1"
        )
        row = cursor.fetchone()
        last_replied_at = row[0] if row else None

        cursor.execute("SELECT jid FROM paused_chats ORDER BY paused_at")
        paused_chats = [r[0] for r in cursor.fetchall()]

        auto_reply_enabled = os.getenv("AUTO_REPLY_ENABLED", "true").lower() == "true"
        all_paused = "*" in paused_chats
        real_paused = [j for j in paused_chats if j != "*"]

        return {
            "enabled": auto_reply_enabled,
            "active": auto_reply_enabled and not all_paused,
            "total_replied": total_replied,
            "replies_today": replies_today,
            "last_replied_at": last_replied_at,
            "paused_chats": real_paused,
        }
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_pause_chat(jid: str) -> None:
    now = datetime.utcnow().isoformat()
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            "INSERT OR REPLACE INTO paused_chats (jid, paused_at) VALUES (?, ?)",
            (jid, now),
        )
        conn.commit()
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_resume_chat(jid: str) -> None:
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM paused_chats WHERE jid = ?", (jid,))
        conn.commit()
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_worker_logs() -> list:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT message_id, chat_jid, replied_at, reply_text, status
            FROM auto_replies
            ORDER BY replied_at DESC
            LIMIT 50
            """
        )
        rows = cursor.fetchall()
        return [
            {
                "message_id": r[0],
                "chat_jid": r[1],
                "replied_at": r[2],
                "reply_text": r[3],
                "status": r[4],
            }
            for r in rows
        ]
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/auth/login")
async def login(body: LoginBody):
    if body.password != DASHBOARD_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"token": _create_token()}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/health")
async def api_health():
    return {"status": "ok"}


@app.get("/status")
async def status(_: None = Depends(require_auth)):
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{BRIDGE_URL}/api/status")
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return {"connected": False, "error": "bridge unreachable"}


@app.get("/qr")
async def qr(_: None = Depends(require_auth)):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{BRIDGE_URL}/api/qr")
            resp.raise_for_status()
            data = resp.json()
            return {
                "qr": data.get("qr", ""),
                "authenticated": data.get("authenticated", False),
            }
    except Exception:
        return {"qr": "", "authenticated": False}


@app.get("/chats")
async def chats(
    query: Optional[str] = None,
    limit: int = 20,
    page: int = 0,
    _: None = Depends(require_auth),
):
    result = await asyncio.to_thread(_db_list_chats, query, limit, page)
    return result


@app.get("/messages")
async def messages(
    chat_jid: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 20,
    page: int = 0,
    after: Optional[str] = None,
    before: Optional[str] = None,
    _: None = Depends(require_auth),
):
    text = await asyncio.to_thread(
        _db_list_messages, chat_jid, query, limit, page, after, before
    )
    return {"messages": text}


@app.get("/contacts/search")
async def contacts_search(q: str = "", _: None = Depends(require_auth)):
    if not q:
        return []
    result = await asyncio.to_thread(_db_search_contacts, q)
    return result


@app.post("/send")
async def send(body: SendMessageBody, _: None = Depends(require_auth)):
    if not body.recipient:
        raise HTTPException(status_code=400, detail="recipient is required")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{BRIDGE_URL}/api/send",
                json={"recipient": body.recipient, "message": body.message},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Bridge error: {e}")


@app.post("/send-file")
async def send_file(body: SendFileBody, _: None = Depends(require_auth)):
    if not body.recipient:
        raise HTTPException(status_code=400, detail="recipient is required")
    if not body.media_path:
        raise HTTPException(status_code=400, detail="media_path is required")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{BRIDGE_URL}/api/send",
                json={"recipient": body.recipient, "media_path": body.media_path},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Bridge error: {e}")


# ---------------------------------------------------------------------------
# Worker control endpoints
# ---------------------------------------------------------------------------

@app.get("/worker/status")
async def worker_status(_: None = Depends(require_auth)):
    try:
        result = await asyncio.to_thread(_db_worker_status)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/worker/pause")
async def worker_pause(body: WorkerPauseBody, _: None = Depends(require_auth)):
    if not body.jid:
        raise HTTPException(status_code=400, detail="jid is required")
    try:
        await asyncio.to_thread(_db_pause_chat, body.jid)
        return {"ok": True, "jid": body.jid, "paused": True}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/worker/resume")
async def worker_resume(body: WorkerPauseBody, _: None = Depends(require_auth)):
    if not body.jid:
        raise HTTPException(status_code=400, detail="jid is required")
    try:
        await asyncio.to_thread(_db_resume_chat, body.jid)
        return {"ok": True, "jid": body.jid, "paused": False}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/worker/logs")
async def worker_logs(_: None = Depends(require_auth)):
    try:
        result = await asyncio.to_thread(_db_worker_logs)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


def _db_pause_all() -> None:
    """Mark a sentinel '*' entry meaning all chats are paused."""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS paused_chats (jid TEXT PRIMARY KEY, paused_at TEXT)"
        )
        conn.execute(
            "INSERT OR REPLACE INTO paused_chats (jid, paused_at) VALUES (?, ?)",
            ("*", datetime.utcnow().isoformat()),
        )
        conn.commit()
    finally:
        conn.close()


def _db_resume_all() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("DELETE FROM paused_chats WHERE jid = '*'")
        conn.commit()
    finally:
        conn.close()


@app.post("/worker/pause-all")
async def worker_pause_all(_: None = Depends(require_auth)):
    try:
        await asyncio.to_thread(_db_pause_all)
        return {"ok": True, "paused": True}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/worker/resume-all")
async def worker_resume_all(_: None = Depends(require_auth)):
    try:
        await asyncio.to_thread(_db_resume_all)
        return {"ok": True, "paused": False}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Lead management DB helpers (sync)
# ---------------------------------------------------------------------------

def _db_list_leads() -> List[dict]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT ls.chat_jid, c.name, ls.stage, ls.is_hot, ls.last_auto_reply, ls.updated_at,
                   m.content as last_message, m.timestamp as last_seen,
                   (SELECT COUNT(*) FROM auto_replies ar WHERE ar.chat_jid = ls.chat_jid AND ar.status='sent') as reply_count,
                   CASE WHEN pc.jid IS NOT NULL THEN 1 ELSE 0 END as budget_paused,
                   ls.notes
            FROM lead_state ls
            LEFT JOIN chats c ON c.jid = ls.chat_jid
            LEFT JOIN messages m ON m.id = (
                SELECT id FROM messages WHERE chat_jid = ls.chat_jid ORDER BY datetime(timestamp) DESC LIMIT 1
            )
            LEFT JOIN paused_chats pc ON pc.jid = ls.chat_jid
            ORDER BY ls.updated_at DESC
            """
        )
        rows = cursor.fetchall()
        result = []
        for row in rows:
            jid = row[0]
            name = row[1]
            result.append(
                {
                    "jid": jid,
                    "display_name": name if name else jid,
                    "stage": row[2],
                    "is_hot": bool(row[3]) if row[3] is not None else False,
                    "budget_paused": bool(row[9]),
                    "last_message": row[6],
                    "last_seen": row[7],
                    "reply_count": row[8] or 0,
                    "notes": row[10] or "",
                }
            )
        return result
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_resume_lead(jid: str) -> None:
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM paused_chats WHERE jid = ?", (jid,))
        conn.commit()
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_get_notifications() -> List[dict]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT pc.jid, c.name, 'budget_pause' as type, pc.paused_at as since,
                   m.content as last_message
            FROM paused_chats pc
            LEFT JOIN chats c ON c.jid = pc.jid
            LEFT JOIN messages m ON m.id = (
                SELECT id FROM messages WHERE chat_jid = pc.jid ORDER BY datetime(timestamp) DESC LIMIT 1
            )
            WHERE pc.jid != '*'

            UNION ALL

            SELECT ls.chat_jid, c.name, 'hot_lead' as type, ls.updated_at as since,
                   m.content as last_message
            FROM lead_state ls
            LEFT JOIN chats c ON c.jid = ls.chat_jid
            LEFT JOIN messages m ON m.id = (
                SELECT id FROM messages WHERE chat_jid = ls.chat_jid ORDER BY datetime(timestamp) DESC LIMIT 1
            )
            WHERE ls.is_hot = 1
            AND ls.chat_jid NOT IN (SELECT jid FROM paused_chats WHERE jid != '*')
            AND NOT EXISTS (
                SELECT 1 FROM messages
                WHERE chat_jid = ls.chat_jid AND is_from_me = 1
                AND datetime(timestamp) > datetime('now', '-24 hours')
            )
            """
        )
        rows = cursor.fetchall()
        result = []
        for row in rows:
            jid = row[0]
            name = row[1]
            result.append(
                {
                    "jid": jid,
                    "display_name": name if name else jid,
                    "type": row[2],
                    "since": row[3],
                    "last_message": row[4],
                }
            )
        return result
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_get_dashboard() -> dict:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM lead_state")
        total_leads = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM lead_state WHERE is_hot = 1")
        hot_leads = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM paused_chats WHERE jid != '*'")
        budget_paused = cursor.fetchone()[0]

        cursor.execute(
            "SELECT COUNT(*) FROM auto_replies WHERE status='sent' AND date(replied_at) = date('now')"
        )
        replies_today = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM lead_state WHERE stage='converted'")
        converted = cursor.fetchone()[0]

        conversion_rate = (converted / total_leads * 100) if total_leads > 0 else 0

        return {
            "total_leads": total_leads,
            "hot_leads": hot_leads,
            "budget_paused": budget_paused,
            "replies_today": replies_today,
            "converted": converted,
            "conversion_rate": round(conversion_rate, 2),
        }
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


def _db_new_messages_since(ts: str) -> List[dict]:
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT chat_jid, content, timestamp, is_from_me
            FROM messages
            WHERE datetime(timestamp) > datetime(?)
            ORDER BY timestamp ASC
            LIMIT 20
            """,
            (ts,),
        )
        rows = cursor.fetchall()
        return [
            {
                "chat_jid": row[0],
                "content": row[1],
                "timestamp": row[2],
                "is_from_me": bool(row[3]),
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        raise RuntimeError(f"DB error: {e}") from e
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Lead management endpoints
# ---------------------------------------------------------------------------

@app.get("/leads")
async def list_leads(_: None = Depends(require_auth)):
    try:
        result = await asyncio.to_thread(_db_list_leads)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


_VALID_JID_SUFFIXES = ("@s.whatsapp.net", "@lid", "@g.us")


@app.get("/leads/export")
async def export_leads(_: None = Depends(require_auth)):
    def _fetch():
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("""
                SELECT ls.chat_jid, c.name, ls.stage, ls.is_hot, ls.notes,
                       ls.last_auto_reply, ls.updated_at,
                       (SELECT COUNT(*) FROM auto_replies ar WHERE ar.chat_jid = ls.chat_jid AND ar.status='sent') as reply_count
                FROM lead_state ls
                LEFT JOIN chats c ON c.jid = ls.chat_jid
                ORDER BY ls.updated_at DESC
            """).fetchall()
        return [dict(r) for r in rows]

    rows = await asyncio.to_thread(_fetch)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["chat_jid", "name", "stage", "is_hot", "notes", "last_auto_reply", "updated_at", "reply_count"])
    writer.writeheader()
    writer.writerows(rows)
    csv_content = output.getvalue()

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"},
    )


@app.post("/leads/{jid}/resume")
async def resume_lead(jid: str, _: None = Depends(require_auth)):
    if not any(jid.endswith(suffix) for suffix in _VALID_JID_SUFFIXES):
        raise HTTPException(status_code=422, detail="Invalid jid format")
    try:
        await asyncio.to_thread(_db_resume_lead, jid)
        return {"ok": True, "jid": jid}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/leads/{jid}/notes")
async def update_lead_notes(jid: str, body: NotesUpdate, _: None = Depends(require_auth)):
    def _do(jid, notes):
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "UPDATE lead_state SET notes = ? WHERE chat_jid = ?",
                (notes[:2000], jid),  # cap at 2000 chars
            )
            conn.commit()
    await asyncio.to_thread(_do, jid, body.notes)
    return {"ok": True, "jid": jid}


@app.get("/notifications")
async def get_notifications(_: None = Depends(require_auth)):
    try:
        result = await asyncio.to_thread(_db_get_notifications)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/dashboard")
async def get_dashboard(_: None = Depends(require_auth)):
    try:
        result = await asyncio.to_thread(_db_get_dashboard)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# SSE events endpoint
# ---------------------------------------------------------------------------

async def _event_generator(token: str):
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        yield "data: {\"error\": \"unauthorized\"}\n\n"
        return

    last_ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    while True:
        try:
            rows = await asyncio.to_thread(_db_new_messages_since, last_ts)
            if rows:
                last_ts = rows[-1]["timestamp"]
                for row in rows:
                    yield f"data: {json.dumps({'type': 'new_message', 'payload': row})}\n\n"
            else:
                yield ": heartbeat\n\n"
            await asyncio.sleep(2)
        except asyncio.CancelledError:
            break


@app.get("/events")
async def sse_events(token: str = Query(...)):
    return StreamingResponse(
        _event_generator(token),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
