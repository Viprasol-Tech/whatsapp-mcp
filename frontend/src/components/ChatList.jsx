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

function displayName(chat) {
  const raw = chat.name || '';
  const jid = chat.jid || '';

  // If name is a real name (not just a number), use it
  if (raw && !/^\d+$/.test(raw)) return raw;

  // For @s.whatsapp.net contacts, show phone with + prefix
  if (jid.endsWith('@s.whatsapp.net')) {
    const phone = jid.replace('@s.whatsapp.net', '');
    return '+' + phone;
  }

  // For @lid contacts, show shortened ID or raw number as phone
  const lid = jid.replace('@lid', '').replace('@s.whatsapp.net', '');
  if (lid.length > 8) return lid.slice(0, 6) + '…' + lid.slice(-4);
  return lid || jid;
}

export default function ChatList({ chats, selectedJid, onSelect }) {
  if (chats === null || chats === undefined) {
    return (
      <div style={{ padding: '8px' }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px' }}>
            <div className="skeleton skeleton-avatar" />
            <div style={{ flex: 1 }}>
              <div className="skeleton skeleton-text" style={{ width: '60%' }} />
              <div className="skeleton skeleton-text" style={{ width: '85%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div style={{ padding: '24px 16px', color: '#8b949e', fontSize: '13px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📱</div>
        <div style={{ fontWeight: 600, marginBottom: '4px', color: '#e6edf3' }}>No conversations yet</div>
        <div>WhatsApp messages will appear here once your account is connected</div>
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
                  {displayName(chat)}
                  {!!chat.is_hot && <span style={{fontSize:'10px',marginLeft:'4px'}}>🔥</span>}
                  {!!chat.budget_paused && <span style={{fontSize:'10px',marginLeft:'2px'}}>⏸</span>}
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
