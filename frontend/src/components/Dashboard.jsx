import { useState, useEffect, useCallback } from 'react';

function MetricCard({ label, value, accent, sub, icon }) {
  const isLoading = value === undefined || value === null;
  return (
    <div style={{
      background: '#16161e',
      border: `1px solid #2a2a3c`,
      borderLeft: `3px solid ${accent || '#2a2a3c'}`,
      borderRadius: 10,
      padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 6,
      flex: '1 1 140px', minWidth: 130,
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
        {icon && <span style={{ fontSize: 16, opacity: 0.6 }}>{icon}</span>}
      </div>
      {isLoading ? (
        <div className="skeleton" style={{ height: 32, width: '50%', borderRadius: 4 }} />
      ) : (
        <div style={{
          fontSize: 30, fontWeight: 700, color: accent || '#e2e8f0',
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          lineHeight: 1,
        }}>{value}</div>
      )}
      {sub && <div style={{ fontSize: 11, color: '#4a5568' }}>{sub}</div>}
    </div>
  );
}

function ActivityRow({ lead, onSelectChat }) {
  const displayName = (lead.name && !/^\d+$/.test(lead.name))
    ? lead.name
    : '+' + (lead.jid || '').replace('@s.whatsapp.net', '').replace(/@.*/, '');

  const relTime = (ts) => {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - new Date(typeof ts === 'number' ? ts * 1000 : ts)) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  };

  return (
    <div
      onClick={() => onSelectChat({ jid: lead.jid, name: lead.name })}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #1a1a2a',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#111118'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%', background: lead.is_hot ? '#7c2d12' : '#1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color: lead.is_hot ? '#f97316' : '#8892a0',
        flexShrink: 0,
      }}>
        {lead.is_hot ? '🔥' : displayName[0]?.toUpperCase() || '?'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{displayName}</div>
        <div style={{ fontSize: 11, color: '#4a5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.last_message ? lead.last_message.slice(0, 55) + (lead.last_message.length > 55 ? '…' : '') : 'No messages yet'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#4a5568' }}>{relTime(lead.last_seen)}</div>
        {lead.budget_paused && (
          <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>⏸ paused</span>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ token, onSelectChat }) {
  const [metrics, setMetrics] = useState(null);
  const [leads, setLeads] = useState([]);

  const headers = { Authorization: 'Bearer ' + token };

  const fetchMetrics = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard', { headers });
      if (r.ok) setMetrics(await r.json());
    } catch (_) {}
  }, [token]);

  const fetchLeads = useCallback(async () => {
    try {
      const r = await fetch('/api/leads', { headers });
      if (r.ok) setLeads(await r.json());
    } catch (_) {}
  }, [token]);

  useEffect(() => {
    fetchMetrics(); fetchLeads();
    const id1 = setInterval(fetchMetrics, 30000);
    const id2 = setInterval(fetchLeads, 30000);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, [fetchMetrics, fetchLeads]);

  const convRate = metrics
    ? metrics.total_leads > 0 ? ((metrics.converted / metrics.total_leads) * 100).toFixed(1) + '%' : '0%'
    : null;

  const recentLeads = [...leads].sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0)).slice(0, 8);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#0a0a0f', minHeight: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Sales Dashboard</h2>
        <div style={{ fontSize: 12, color: '#4a5568' }}>Live metrics · auto-refreshes every 30s</div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 32 }}>
        <MetricCard label="Total Leads"      value={metrics?.total_leads}    accent="#25d366" icon="👥" />
        <MetricCard label="Hot Leads"        value={metrics?.hot_leads}      accent="#f59e0b" icon="🔥" />
        <MetricCard label="Budget Paused"    value={metrics?.budget_paused}  accent="#eab308" icon="⏸"
          sub={metrics?.budget_paused > 0 ? 'Need follow-up' : 'All bots running'} />
        <MetricCard label="Replies Today"    value={metrics?.replies_today}  icon="💬" />
        <MetricCard label="Converted"        value={metrics?.converted}      accent="#25d366" icon="✅" />
        <MetricCard label="Conversion Rate"  value={convRate}                accent="#25d366" icon="📈"
          sub={metrics?.total_leads > 0 ? `${metrics.total_leads} total tracked` : undefined} />
      </div>

      {/* Recent Activity */}
      <div style={{ background: '#16161e', border: '1px solid #2a2a3c', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #2a2a3c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#8892a0' }}>Recent Activity</div>
          <div style={{ fontSize: 11, color: '#4a5568' }}>{leads.length} leads tracked</div>
        </div>
        {recentLeads.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#4a5568', fontSize: 13 }}>
            No leads yet. Leads appear here once the bot starts conversations.
          </div>
        ) : (
          recentLeads.map(lead => (
            <ActivityRow key={lead.jid} lead={lead} onSelectChat={onSelectChat} />
          ))
        )}
      </div>
    </div>
  );
}
