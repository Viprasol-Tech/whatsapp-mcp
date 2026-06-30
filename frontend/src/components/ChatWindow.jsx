import { useState, useRef, useEffect } from 'react';

const AVATAR_COLORS = [
  '#6b5b95', '#d35400', '#1a7a5e', '#2c3e8c', '#7d3c98', '#b03a2e',
];

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function formatMsgTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date)) return timestamp;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date)) return '';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function ChatWindow({ chat, messages, loading, onSend, botPaused, onToggleBot }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setText('');
    await onSend(msg);
    setSending(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const color = avatarColor(chat.name || chat.jid);

  // Group messages by date for dividers
  let lastDate = '';
  const items = [];
  messages.forEach((m, i) => {
    const dateLabel = formatDateLabel(m.timestamp);
    if (dateLabel && dateLabel !== lastDate) {
      items.push({ type: 'divider', label: dateLabel, key: `d-${i}` });
      lastDate = dateLabel;
    }
    items.push({ type: 'message', ...m, key: `m-${m.id}` });
  });

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div
          className="chat-header-avatar"
          style={{ background: chat.is_group ? '#00a884' : color }}
        >
          {initials(chat.name || chat.jid)}
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{chat.name || chat.jid}</div>
          <div className="chat-header-sub">
            {chat.is_group ? 'Group' : chat.jid}
          </div>
        </div>
        <button
          className={`bot-toggle-btn ${botPaused ? 'bot-off' : 'bot-on'}`}
          onClick={onToggleBot}
          title={botPaused ? 'Bot is OFF — click to enable auto-reply' : 'Bot is ON — click to disable auto-reply'}
        >
          🤖 {botPaused ? 'Bot OFF' : 'Bot ON'}
        </button>
      </div>

      {/* Messages */}
      {loading ? (
        <div className="loading-messages">
          <div className="spinner" />
        </div>
      ) : messages.length === 0 ? (
        <div className="no-messages">No messages yet</div>
      ) : (
        <div className="messages-area">
          {items.map(item => {
            if (item.type === 'divider') {
              return (
                <div key={item.key} className="message-date-divider">
                  {item.label}
                </div>
              );
            }
            return (
              <div
                key={item.key}
                className={`message-wrapper ${item.isSent ? 'sent' : 'received'}`}
              >
                <div className={`message-bubble ${item.isSent ? 'sent' : 'received'}`}>
                  {!item.isSent && item.sender && (
                    <div className="message-sender">{item.sender}</div>
                  )}
                  <div className="message-text">{item.text}</div>
                  <div className="message-time">{formatMsgTime(item.timestamp)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="input-bar">
        <textarea
          ref={textareaRef}
          className="message-input"
          placeholder="Type a message"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={sending}
        />
        <button
          className="send-button"
          onClick={handleSend}
          disabled={!text.trim() || sending}
          title="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
