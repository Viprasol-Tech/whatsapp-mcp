import React from 'react';

function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function truncate(str, max = 45) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export default function ChatList({ chats, selectedJid, onSelect }) {
  if (!chats || chats.length === 0) {
    return (
      <div style={{ padding: '24px 16px', color: '#5a6478', fontSize: '13px', textAlign: 'center' }}>
        No chats found
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {chats.map((chat) => {
        const active = chat.jid === selectedJid;
        return (
          <div
            key={chat.jid}
            onClick={() => onSelect(chat)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              cursor: 'pointer',
              background: active ? '#1a2235' : 'transparent',
              borderBottom: '1px solid #1a1f2e',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#161b27'; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Avatar */}
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: '#25d366',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: 700,
              color: '#0f1117',
              flexShrink: 0,
            }}>
              {(chat.name || '?')[0].toUpperCase()}
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#e8eaf0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chat.name || chat.jid}
                </span>
                <span style={{ fontSize: '11px', color: '#5a6478', flexShrink: 0, marginLeft: '8px' }}>
                  {formatTime(chat.last_message_time)}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#5a6478', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {truncate(chat.last_message)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
