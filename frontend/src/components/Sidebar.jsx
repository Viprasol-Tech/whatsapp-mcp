const AVATAR_COLORS = [
  '#6b5b95', '#d35400', '#1a7a5e', '#2c3e8c', '#7d3c98', '#b03a2e',
  '#1a6b8a', '#6b8e23', '#8b4513', '#2e4057',
];

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  if (isNaN(date)) return '';
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

export default function Sidebar({ chats, activeChat, onSelectChat, searchQuery, onSearch }) {
  return (
    <>
      <div className="search-container">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="chat-list">
        {!chats ? (
          <div className="no-chats">Loading...</div>
        ) : chats.length === 0 ? (
          <div className="no-chats">No chats found</div>
        ) : (
          chats.map(chat => {
            const isActive = activeChat?.jid === chat.jid;
            const color = avatarColor(chat.name || chat.jid);
            return (
              <div
                key={chat.jid}
                className={`chat-item${isActive ? ' active' : ''}`}
                onClick={() => onSelectChat(chat)}
              >
                <div
                  className={`chat-avatar${chat.is_group ? ' group' : ''}`}
                  style={{ background: chat.is_group ? '#00a884' : color }}
                >
                  {initials(chat.name || chat.jid)}
                </div>
                <div className="chat-content">
                  <div className="chat-row-top">
                    <span className="chat-name">{chat.name || chat.jid}</span>
                    <span className="chat-time">{formatTime(chat.last_message_time)}</span>
                  </div>
                  <div className="chat-preview">{chat.last_message || ''}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
