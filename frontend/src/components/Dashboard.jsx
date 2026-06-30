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

function displayJid(jid, name) {
  if (name && !/^\d+$/.test(name)) return name;
  if (!jid) return jid;
  if (jid.endsWith('@s.whatsapp.net')) return '+' + jid.replace('@s.whatsapp.net', '');
  return jid.replace(/@.*/, '');
}

const cardBase = {
  background: '#1a2235',
  border: '1px solid #232d42',
  borderRadius: '10px',
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minWidth: '140px',
  flex: '1 1 140px',
};

function MetricCard({ label, value, accent }) {
  return (
    <div style={{ ...cardBase, borderLeft: accent ? `3px solid ${accent}` : '3px solid #232d42' }}>
      <div style={{ fontSize: '11px', color: '#5a6478', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: 700, color: accent || '#e8eaf0' }}>{value ?? '—'}</div>
    </div>
  );
}

export default function Dashboard({ token, onSelectChat }) {
  const [metrics, setMetrics] = useState(null);
  const [leads, setLeads] = useState([]);
  const [resuming, setResuming] = useState({});
  const [error, setError] = useState('');

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
    fetchMetrics();
    fetchLeads();
    const id1 = setInterval(fetchMetrics, 30000);
    const id2 = setInterval(fetchLeads, 30000);
    return () => { clearInterval(id1); clearInterval(id2); };
  }, [fetchMetrics, fetchLeads]);

  const resumeBot = async (jid) => {
    setResuming(p => ({ ...p, [jid]: true }));
    try {
      await fetch(`/api/leads/${encodeURIComponent(jid)}/resume`, { method: 'POST', headers });
      fetchLeads();
    } catch (_) {}
    setResuming(p => ({ ...p, [jid]: false }));
  };

  const convRate = metrics
    ? metrics.total_leads > 0
      ? ((metrics.converted / metrics.total_leads) * 100).toFixed(1) + '%'
      : '0%'
    : '—';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#0f1117', minHeight: 0 }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#e8eaf0', marginBottom: '4px' }}>Sales Dashboard</h2>
        <div style={{ fontSize: '12px', color: '#5a6478' }}>Live metrics · refreshes every 30s</div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '32px' }}>
        <MetricCard label="Total Leads" value={metrics?.total_leads} accent="#25d366" />
        <MetricCard label="Hot Leads" value={metrics?.hot_leads} accent="#f59e0b" />
        <MetricCard label="Budget Paused" value={metrics?.budget_paused} accent="#eab308" />
        <MetricCard label="Replies Today" value={metrics?.replies_today} />
        <MetricCard label="Converted" value={metrics?.converted} accent="#25d366" />
        <MetricCard label="Conversion Rate" value={convRate} accent="#25d366" />
      </div>

      {/* Leads Table */}
      <div style={{ background: '#1a2235', border: '1px solid #232d42', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #232d42', fontSize: '13px', fontWeight: 600, color: '#8898aa' }}>
          Leads
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#151c2c' }}>
                {['Name / JID', 'Stage', 'Hot', 'Budget Paused', 'Last Message', 'Last Seen', 'Replies', 'Action'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#5a6478', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#5a6478' }}>No leads yet</td>
                </tr>
              ) : leads.map((lead, i) => (
                <tr
                  key={lead.jid}
                  style={{ borderBottom: '1px solid #1a1f2e', transition: 'background 0.1s', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#161b27'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 14px', color: '#e8eaf0', fontWeight: 600 }}
                    onClick={() => onSelectChat({ jid: lead.jid, name: lead.name })}>
                    {displayJid(lead.jid, lead.name)}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#8898aa' }}>{lead.stage || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {!!lead.is_hot ? <span style={{ color: '#f59e0b' }}>🔥</span> : <span style={{ color: '#374051' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {!!lead.budget_paused ? <span style={{ color: '#eab308' }}>⏸</span> : <span style={{ color: '#374051' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#8898aa', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.last_message ? lead.last_message.slice(0, 50) + (lead.last_message.length > 50 ? '…' : '') : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#8898aa', whiteSpace: 'nowrap' }}>
                    {relativeTime(lead.last_seen)}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#8898aa', textAlign: 'center' }}>
                    {lead.reply_count ?? 0}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {!!lead.budget_paused && (
                      <button
                        onClick={() => resumeBot(lead.jid)}
                        disabled={!!resuming[lead.jid]}
                        style={{
                          background: resuming[lead.jid] ? '#232d42' : '#25d366',
                          color: resuming[lead.jid] ? '#5a6478' : '#0f1117',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '5px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: resuming[lead.jid] ? 'not-allowed' : 'pointer',
                          transition: 'background 0.15s',
                        }}
                      >
                        {resuming[lead.jid] ? '...' : 'Resume Bot'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
