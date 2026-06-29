import React from 'react';

export default function StatusBadge({ connected }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: '#161b27',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: 500,
      color: connected ? '#25d366' : '#ff4d4f',
    }}>
      <span style={{
        width: '9px',
        height: '9px',
        borderRadius: '50%',
        background: connected ? '#25d366' : '#ff4d4f',
        boxShadow: connected ? '0 0 6px #25d366' : '0 0 6px #ff4d4f',
        flexShrink: 0,
      }} />
      {connected ? 'Connected' : 'Disconnected'}
    </div>
  );
}
