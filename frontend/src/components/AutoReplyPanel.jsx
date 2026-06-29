import { useState, useEffect, useCallback } from 'react';

const API = '/api';

export default function AutoReplyPanel({ token, onClose }) {
  const [workerStatus, setWorkerStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const authHeaders = useCallback(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  const apiFetch = useCallback(async (path, opts = {}) => {
    return fetch(`${API}${path}`, {
      ...opts,
      headers: { ...authHeaders(), ...(opts.headers || {}) },
    });
  }, [authHeaders]);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await apiFetch('/worker/status');
      if (r.ok) {
        const data = await r.json();
        setWorkerStatus(data);
      }
    } catch (_) {}
  }, [apiFetch]);

  const fetchLogs = useCallback(async () => {
    try {
      const r = await apiFetch('/worker/logs');
      if (r.ok) {
        const data = await r.json();
        setLogs(Array.isArray(data) ? data.slice(0, 10) : []);
      }
    } catch (_) {}
  }, [apiFetch]);

  useEffect(() => {
    fetchStatus();
    fetchLogs();
    const id = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 10000);
    return () => clearInterval(id);
  }, [fetchStatus, fetchLogs]);

  const handleToggle = async () => {
    if (loading) return;
    setLoading(true);
    const isActive = workerStatus?.active;
    try {
      await apiFetch(isActive ? '/worker/pause-all' : '/worker/resume-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      await fetchStatus();
    } catch (_) {}
    setLoading(false);
  };

  const handleResumePausedChat = async (jid) => {
    try {
      await apiFetch('/worker/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid }),
      });
      await fetchStatus();
    } catch (_) {}
  };

  const isActive = workerStatus?.active ?? false;
  const repliedToday = workerStatus?.replies_today ?? 0;
  const pausedChats = workerStatus?.paused_chats ?? [];

  return (
    <div className="auto-reply-panel">
      <div className="auto-reply-header">
        <span className="auto-reply-title">Auto-Reply</span>
        <button className="auto-reply-close" onClick={onClose}>&#x2715;</button>
      </div>

      {/* Status card */}
      <div className="auto-reply-status-card">
        <div className="auto-reply-status-indicator">
          <div className={`auto-reply-dot ${isActive ? 'active' : 'paused'}`} />
          <span className="auto-reply-status-text">{isActive ? 'Active' : 'Paused'}</span>
        </div>
        <div className="auto-reply-stat">{repliedToday} messages auto-replied today</div>
        <button
          className={`auto-reply-toggle-btn ${isActive ? 'pause' : 'resume'}`}
          onClick={handleToggle}
          disabled={loading}
        >
          {loading ? '...' : isActive ? 'Pause All' : 'Resume All'}
        </button>
      </div>

      {/* Recent Activity */}
      <div className="auto-reply-section-title">Recent Activity</div>
      <div className="auto-reply-log-list">
        {logs.length === 0 ? (
          <div className="auto-reply-empty">No recent activity</div>
        ) : (
          logs.map((item, i) => (
            <div key={i} className={`auto-reply-log-item ${item.status === 'failed' ? 'failed' : 'success'}`}>
              <div className="auto-reply-log-jid">{truncateJid(item.jid)}</div>
              <div className="auto-reply-log-meta">
                <span className="auto-reply-log-time">{formatTime(item.time)}</span>
                <span className="auto-reply-log-status">{item.status === 'failed' ? '✕' : '✓'}</span>
              </div>
              <div className="auto-reply-log-text">{(item.reply || '').slice(0, 60)}</div>
            </div>
          ))
        )}
      </div>

      {/* Per-chat pause list */}
      {pausedChats.length > 0 && (
        <>
          <div className="auto-reply-section-title">Paused Chats</div>
          <div className="auto-reply-paused-list">
            {pausedChats.map((jid, i) => (
              <div key={i} className="auto-reply-paused-item">
                <span className="auto-reply-paused-jid">{truncateJid(jid)}</span>
                <button
                  className="auto-reply-resume-btn"
                  onClick={() => handleResumePausedChat(jid)}
                >
                  Resume
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function truncateJid(jid) {
  if (!jid) return 'Unknown';
  const parts = jid.split('@');
  const num = parts[0] || jid;
  return num.length > 15 ? num.slice(0, 12) + '...' : num;
}

function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return ts;
  }
}
