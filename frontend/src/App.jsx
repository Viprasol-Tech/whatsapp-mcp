import React, { useState, useEffect, useCallback } from 'react';
import StatusBadge from './components/StatusBadge.jsx';
import ChatList from './components/ChatList.jsx';
import MessageView from './components/MessageView.jsx';
import SendForm from './components/SendForm.jsx';
import QRModal from './components/QRModal.jsx';

const COLORS = {
  bg: '#0f1117',
  surface: '#1e2433',
  sidebar: '#141922',
  border: '#1a1f2e',
  accent: '#25d366',
  text: '#e8eaf0',
  muted: '#5a6478',
};

export default function App() {
  const [connected, setConnected] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [chats, setChats] = useState([]);
  const [chatSearch, setChatSearch] = useState('');
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendError, setSendError] = useState(null);

  // Poll connection status every 5s
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConnected(!!data.connected);
        setShowQR(!data.connected);
      } catch {
        setConnected(false);
        setShowQR(true);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch chats on mount and when search changes
  const fetchChats = useCallback(async (query = '') => {
    try {
      const params = new URLSearchParams({ limit: 30, page: 0 });
      if (query) params.set('query', query);
      const res = await fetch(`/api/chats?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setChats(Array.isArray(data) ? data : []);
    } catch {
      setChats([]);
    }
  }, []);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => fetchChats(chatSearch), 350);
    return () => clearTimeout(timer);
  }, [chatSearch, fetchChats]);

  // Fetch messages when selected chat changes
  useEffect(() => {
    if (!selectedChat) return;
    setMessages(null);
    setMessagesLoading(true);

    async function fetchMessages() {
      try {
        const params = new URLSearchParams({ chat_jid: selectedChat.jid, limit: 50, page: 0 });
        const res = await fetch(`/api/messages?${params}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setMessages(data.messages || '');
      } catch {
        setMessages('Failed to load messages.');
      } finally {
        setMessagesLoading(false);
      }
    }

    fetchMessages();
  }, [selectedChat]);

  async function handleSend(message) {
    if (!selectedChat) return;
    setSendError(null);
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: selectedChat.jid, message }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Send failed');
      // Refresh messages after send
      const params = new URLSearchParams({ chat_jid: selectedChat.jid, limit: 50, page: 0 });
      const msgRes = await fetch(`/api/messages?${params}`);
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || '');
      }
    } catch (err) {
      setSendError(err.message || 'Failed to send message');
    }
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100vw',
      background: COLORS.bg,
      color: COLORS.text,
      overflow: 'hidden',
    }}>
      {/* QR Modal overlay */}
      {showQR && <QRModal />}

      {/* Left Sidebar */}
      <div style={{
        width: '320px',
        flexShrink: 0,
        background: COLORS.sidebar,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}>
        {/* Sidebar header */}
        <div style={{
          padding: '16px',
          borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '17px', fontWeight: 700, color: COLORS.text }}>
              WhatsApp
            </span>
            <StatusBadge connected={connected} />
          </div>

          {/* Search box */}
          <input
            type="text"
            value={chatSearch}
            onChange={e => setChatSearch(e.target.value)}
            placeholder="Search chats…"
            style={{
              background: '#1e2433',
              border: `1px solid ${COLORS.border}`,
              borderRadius: '20px',
              padding: '8px 14px',
              color: COLORS.text,
              fontSize: '13px',
              outline: 'none',
              width: '100%',
            }}
            onFocus={e => { e.target.style.borderColor = COLORS.accent; }}
            onBlur={e => { e.target.style.borderColor = COLORS.border; }}
          />
        </div>

        {/* Chat list */}
        <ChatList
          chats={chats}
          selectedJid={selectedChat?.jid}
          onSelect={chat => { setSelectedChat(chat); setSendError(null); }}
        />
      </div>

      {/* Right Panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: COLORS.bg,
      }}>
        {/* Chat header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minHeight: '60px',
        }}>
          {selectedChat ? (
            <>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: COLORS.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#0f1117',
                fontSize: '15px',
                flexShrink: 0,
              }}>
                {(selectedChat.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{selectedChat.name || selectedChat.jid}</div>
                <div style={{ fontSize: '11px', color: COLORS.muted }}>{selectedChat.jid}</div>
              </div>
            </>
          ) : (
            <span style={{ color: COLORS.muted, fontSize: '14px' }}>Select a conversation</span>
          )}
        </div>

        {/* Messages area */}
        <MessageView messages={messages} loading={messagesLoading} />

        {/* Send error */}
        {sendError && (
          <div style={{
            padding: '8px 20px',
            background: '#2a1a1a',
            color: '#ff4d4f',
            fontSize: '12px',
            borderTop: `1px solid #3a1a1a`,
          }}>
            {sendError}
          </div>
        )}

        {/* Send form */}
        <SendForm onSend={handleSend} disabled={!selectedChat || !connected} />
      </div>
    </div>
  );
}
