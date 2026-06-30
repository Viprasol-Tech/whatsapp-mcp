const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  )},
  { id: 'leads', label: 'Leads', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )},
  { id: 'whatsapp', label: 'WhatsApp', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
    </svg>
  )},
  { id: 'admin', label: 'Admin', icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )},
];

export default function NavSidebar({ activeView, onChangeView, status, notificationCount, onLogout }) {
  return (
    <div style={{
      width: 220,
      minWidth: 220,
      height: '100vh',
      background: '#0d1117',
      borderRight: '1px solid #21262d',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #21262d' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#25d366', letterSpacing: '-0.3px' }}>
          🤖 Viprasol Tech
        </div>
        <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>WhatsApp Sales Bot</div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                border: 'none',
                background: isActive ? '#161b22' : 'transparent',
                color: isActive ? '#e6edf3' : '#8b949e',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#161b22'; e.currentTarget.style.color = '#e6edf3'; }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8b949e'; } }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 20, background: '#25d366', borderRadius: '0 2px 2px 0',
                }}/>
              )}
              <span style={{ color: isActive ? '#25d366' : 'inherit', display: 'flex' }}>{item.icon}</span>
              {item.label}
              {item.id === 'whatsapp' && notificationCount > 0 && (
                <span style={{
                  marginLeft: 'auto', background: '#f85149', color: '#fff',
                  borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                }}>{notificationCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom status + logout */}
      <div style={{ borderTop: '1px solid #21262d', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: status.connected ? '#25d366' : '#f85149',
            flexShrink: 0,
          }}/>
          <span style={{ color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {status.connected ? (status.phone || 'Connected') : 'Disconnected'}
          </span>
        </div>
        <button
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 10px', borderRadius: 6, border: 'none',
            background: 'transparent', color: '#8b949e', fontSize: 12,
            cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1f2937'; e.currentTarget.style.color = '#f85149'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8b949e'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logout
        </button>
      </div>
    </div>
  );
}
