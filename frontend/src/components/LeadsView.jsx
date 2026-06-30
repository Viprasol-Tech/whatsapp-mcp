import { useState, useEffect, useCallback } from 'react';

function relativeTime(ts) {
  if (!ts) return '—';
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

const STAGE_COLORS = {
  new:            { bg: 'rgba(88,166,255,0.12)', color: '#58a6ff', label: 'New' },
  contacted:      { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', label: 'Contacted' },
  qualifying:     { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', label: 'Qualifying' },
  budget_pending: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'Budget Pending' },
  hot:            { bg: 'rgba(239,68,68,0.12)',  color: '#f87171', label: 'Hot 🔥' },
  converted:      { bg: 'rgba(37,211,102,0.12)', color: '#25d366', label: 'Converted' },
  lost:           { bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', label: 'Lost' },
};

function StageBadge({ stage }) {
  const cfg = STAGE_COLORS[stage] || { bg: 'rgba(107,114,128,0.12)', color: '#9ca3af', label: stage || '—' };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`,
      borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600,
      whiteSpace: 'nowrap', display: 'inline-block',
    }}>{cfg.label}</span>
  );
}

const FILTERS = ['all', 'hot', 'budget_paused', 'converted'];

export default function LeadsView({ token, onSelectChat }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [resuming, setResuming] = useState({});
  const [sortKey, setSortKey] = useState('last_seen');
  const [sortDir, setSortDir] = useState('desc');

  const headers = { Authorization: 'Bearer ' + token };

  const fetchLeads = useCallback(async () => {
    try {
      const r = await fetch('/api/leads', { headers });
      if (r.ok) { setLeads(await r.json()); }
    } catch (_) {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchLeads();
    const id = setInterval(fetchLeads, 30000);
    return () => clearInterval(id);
  }, [fetchLeads]);

  const resumeBot = async (jid, e) => {
    e.stopPropagation();
    setResuming(p => ({ ...p, [jid]: true }));
    try {
      await fetch(`/api/leads/${encodeURIComponent(jid)}/resume`, { method: 'POST', headers });
      fetchLeads();
    } catch (_) {}
    setResuming(p => ({ ...p, [jid]: false }));
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filtered = leads
    .filter(l => {
      if (filter === 'hot') return !!l.is_hot;
      if (filter === 'budget_paused') return !!l.budget_paused;
      if (filter === 'converted') return l.stage === 'converted';
      return true;
    })
    .filter(l => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (displayJid(l.jid, l.name) || '').toLowerCase().includes(q) ||
             (l.last_message || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'reply_count') { av = av ?? 0; bv = bv ?? 0; }
      if (sortKey === 'last_seen') { av = av ?? 0; bv = bv ?? 0; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <span style={{ color: '#3a4055', marginLeft: 4 }}>↕</span>;
    return <span style={{ color: '#25d366', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const COLS = [
    { key: 'name', label: 'Lead', sortable: false },
    { key: 'stage', label: 'Stage', sortable: false },
    { key: 'last_message', label: 'Last Message', sortable: false },
    { key: 'last_seen', label: 'Last Seen', sortable: true },
    { key: 'reply_count', label: 'Replies', sortable: true },
    { key: 'action', label: 'Action', sortable: false },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: '#0a0a0f', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0' }}>Leads</h2>
          <div style={{ fontSize: 12, color: '#8892a0', marginTop: 2 }}>
            {filtered.length} of {leads.length} leads
          </div>
        </div>
        <a
          href="/api/leads/export"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#16161e', border: '1px solid #2a2a3c', borderRadius: 8,
            padding: '8px 14px', color: '#8892a0', fontSize: 13, fontWeight: 500,
            textDecoration: 'none', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#3a3a5c'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#8892a0'; e.currentTarget.style.borderColor = '#2a2a3c'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </a>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', background: '#16161e', border: '1px solid #2a2a3c', borderRadius: 8, overflow: 'hidden' }}>
          {[
            { key: 'all', label: `All (${leads.length})` },
            { key: 'hot', label: `🔥 Hot (${leads.filter(l => l.is_hot).length})` },
            { key: 'budget_paused', label: `⏸ Paused (${leads.filter(l => l.budget_paused).length})` },
            { key: 'converted', label: `✓ Converted (${leads.filter(l => l.stage === 'converted').length})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '7px 14px', border: 'none', background: filter === f.key ? '#25d366' : 'transparent',
                color: filter === f.key ? '#0a0a0f' : '#8892a0',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >{f.label}</button>
          ))}
        </div>
        <div style={{
          flex: 1, maxWidth: 280,
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#16161e', border: '1px solid #2a2a3c', borderRadius: 8, padding: '7px 12px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text" placeholder="Search leads…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', outline: 'none', color: '#e2e8f0', fontSize: 13, width: '100%', fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#16161e', border: '1px solid #2a2a3c', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#111118' }}>
                {COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                    style={{
                      padding: '11px 16px', textAlign: 'left',
                      color: '#4a5568', fontWeight: 600, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      whiteSpace: 'nowrap', cursor: col.sortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      borderBottom: '1px solid #2a2a3c',
                    }}
                  >
                    {col.label}
                    {col.sortable && <SortIcon col={col.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {COLS.map(col => (
                      <td key={col.key} style={{ padding: '12px 16px' }}>
                        <div className="skeleton" style={{ height: 14, width: col.key === 'action' ? 80 : '70%' }}/>
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} style={{ padding: '48px', textAlign: 'center', color: '#4a5568' }}>
                    {search || filter !== 'all' ? 'No leads match your filter.' : 'No leads tracked yet.'}
                  </td>
                </tr>
              ) : filtered.map(lead => (
                <tr
                  key={lead.jid}
                  style={{ borderBottom: '1px solid #1a1a2a', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#111118'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => onSelectChat({ jid: lead.jid, name: lead.name })}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{displayJid(lead.jid, lead.name)}</div>
                    <div style={{ fontSize: 11, color: '#4a5568', marginTop: 2 }}>
                      {lead.is_hot && <span style={{ color: '#f59e0b' }}>🔥 Hot · </span>}
                      {lead.budget_paused && <span style={{ color: '#8892a0' }}>⏸ Bot paused</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StageBadge stage={lead.stage} />
                  </td>
                  <td style={{ padding: '12px 16px', color: '#8892a0', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.last_message ? lead.last_message.slice(0, 60) + (lead.last_message.length > 60 ? '…' : '') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#8892a0', whiteSpace: 'nowrap' }}>
                    {relativeTime(lead.last_seen)}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#e2e8f0', fontWeight: 600, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    {lead.reply_count ?? 0}
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    {!!lead.budget_paused && (
                      <button
                        onClick={(e) => resumeBot(lead.jid, e)}
                        disabled={!!resuming[lead.jid]}
                        style={{
                          background: resuming[lead.jid] ? '#1f1f2e' : '#25d366',
                          color: resuming[lead.jid] ? '#4a5568' : '#0a0a0f',
                          border: 'none', borderRadius: 6,
                          padding: '5px 12px', fontSize: 12, fontWeight: 600,
                          cursor: resuming[lead.jid] ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s', fontFamily: 'inherit',
                        }}
                      >
                        {resuming[lead.jid] ? '…' : 'Resume Bot'}
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
