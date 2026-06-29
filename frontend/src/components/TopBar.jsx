export default function TopBar({ status }) {
  const initial = status.phone
    ? status.phone.replace(/\D/g, '').slice(-4, -3) || 'W'
    : 'W';

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <div className="top-bar-avatar">{initial.toUpperCase()}</div>
        <div className="top-bar-info">
          <div className="top-bar-phone">
            {status.phone || 'WhatsApp MCP'}
          </div>
          <div className="top-bar-status">
            <div className={`status-dot${status.connected ? ' connected' : ''}`} />
            {status.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>
    </div>
  );
}
