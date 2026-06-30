import { useState, useEffect, useCallback } from 'react';

function relativeTime(ts) {
  if (!ts) return '';
  const date = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  const diff = Math.floor((Date.now() - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

export default function NotificationsPanel({ token, onClose, onSelectChat }) {
  const [notifications, setNotifications] = useState([]);

  const headers = { Authorization: 'Bearer ' + token };

  const fetchNotifications = useCallback(async () => {
    try {
      const r = await fetch('/api/notifications', { headers });
      if (r.ok) setNotifications(await r.json());
    } catch (_) {}
  }, [token]);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 15000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      height: '100vh',
      width: '380px',
      background: '#1a1f2e',
      borderLeft: '1px solid #232d42',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideInRight 0.22s ease',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px',
        background: '#202c33',
        borderBottom: '1px solid #1f2c34',
        minHeight: '60px',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#e8eaf0' }}>Notifications</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8898aa',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '6px',
            lineHeight: 1,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#2a3942'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
          aria-label="Close notifications"
        >
          ✕
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: '#5a6478', fontSize: '13px' }}>
            No notifications
          </div>
        ) : notifications.map((n, i) => {
          const isHot = n.type === 'hot_lead';
          const icon = isHot ? '🔥' : '⏸';
          const typeLabel = isHot ? 'Hot Lead' : 'Awaiting Budget Discussion';
          const preview = n.last_message
            ? n.last_message.slice(0, 60) + (n.last_message.length > 60 ? '…' : '')
            : '';

          return (
            <div
              key={n.jid || i}
              style={{
                background: '#151c2c',
                border: '1px solid #232d42',
                borderLeft: `3px solid ${isHot ? '#f59e0b' : '#eab308'}`,
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px' }}>{icon}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#e8eaf0' }}>
                    {n.name || n.jid}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: '#5a6478', flexShrink: 0 }}>
                  {relativeTime(n.since)}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: isHot ? '#f59e0b' : '#eab308', fontWeight: 600 }}>
                {typeLabel}
              </div>
              {preview && (
                <div style={{ fontSize: '12px', color: '#8898aa', lineHeight: 1.4 }}>
                  {preview}
                </div>
              )}
              <button
                onClick={() => { onSelectChat({ jid: n.jid, name: n.name }); onClose(); }}
                style={{
                  alignSelf: 'flex-start',
                  background: '#25d366',
                  color: '#0f1117',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginTop: '2px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1db954'}
                onMouseLeave={e => e.currentTarget.style.background = '#25d366'}
              >
                Open Chat
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
