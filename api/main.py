import asyncio
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_PATH = os.getenv("DB_PATH", "/app/store/messages.db")
BRIDGE_URL = os.getenv("BRIDGE_URL", "http://localhost:8080")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="WhatsApp MCP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
                messages.content   AS last_message,
                messages.sender    AS last_sender,
                messages.is_from_me AS last_is_from_me
            FROM chats
            LEFT JOIN messages
                ON chats.jid = messages.chat_jid
                AND chats.last_message_time = messages.timestamp
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

class SendMessageBody(BaseModel):
    recipient: str
    message: str


class SendFileBody(BaseModel):
    recipient: str
    media_path: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{BRIDGE_URL}/api/status")
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return {"connected": False, "error": "bridge unreachable"}


@app.get("/qr")
async def qr():
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
):
    text = await asyncio.to_thread(
        _db_list_messages, chat_jid, query, limit, page, after, before
    )
    return {"messages": text}


@app.get("/contacts/search")
async def contacts_search(q: str = ""):
    if not q:
        return []
    result = await asyncio.to_thread(_db_search_contacts, q)
    return result


@app.post("/send")
async def send(body: SendMessageBody):
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
async def send_file(body: SendFileBody):
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
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
