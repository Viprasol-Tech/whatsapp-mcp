import { useState, useEffect } from 'react';

function Section({ title, children }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #21262d', fontSize: 13, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {title}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
  padding: '9px 12px', color: '#e6edf3', fontSize: 13, outline: 'none',
  transition: 'border-color 0.2s',
};

const btnPrimary = {
  background: '#25d366', color: '#0d1117', border: 'none', borderRadius: 6,
  padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  transition: 'opacity 0.15s',
};

const btnDanger = {
  background: 'transparent', color: '#f85149', border: '1px solid #f85149',
  borderRadius: 6, padding: '9px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

export default function AdminView({ token }) {
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState({ text: '', ok: true });
  const [pwLoading, setPwLoading] = useState(false);

  const [botEnabled, setBotEnabled] = useState(true);
  const [botLoading, setBotLoading] = useState(false);

  const [sysStatus, setSysStatus] = useState(null);

  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/worker/status', { headers: { Authorization: 'Bearer ' + token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && !cancelled) {
          setSysStatus(d);
          // Derive real bot state from server — all_paused means bot is stopped
          setBotEnabled(!d.all_paused);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  async function changePassword(e) {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) {
      setPwMsg({ text: 'New passwords do not match.', ok: false });
      return;
    }
    if (pwForm.newPw.length < 6) {
      setPwMsg({ text: 'Password must be at least 6 characters.', ok: false });
      return;
    }
    setPwLoading(true);
    setPwMsg({ text: '', ok: true });
    try {
      const r = await fetch('/api/admin/change-password', {
        method: 'POST', headers,
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.newPw }),
      });
      const data = await r.json();
      if (r.ok) {
        setPwMsg({ text: 'Password updated successfully.', ok: true });
        setPwForm({ current: '', newPw: '', confirm: '' });
      } else {
        setPwMsg({ text: data.detail || 'Failed to update password.', ok: false });
      }
    } catch {
      setPwMsg({ text: 'Network error.', ok: false });
    } finally {
      setPwLoading(false);
    }
  }

  async function toggleBot() {
    setBotLoading(true);
    try {
      const endpoint = botEnabled ? '/api/worker/pause-all' : '/api/worker/resume-all';
      const r = await fetch(endpoint, { method: 'POST', headers });
      if (r.ok) {
        setBotEnabled(v => !v);
      } else {
        alert('Failed to update bot state. Please try again.');
      }
    } catch {
      alert('Network error — could not reach server.');
    } finally {
      setBotLoading(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', background: '#0f1117', minHeight: 0 }}>
      <div style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e6edf3', marginBottom: 4 }}>Admin Settings</h2>
        <p style={{ fontSize: 13, color: '#8b949e', marginBottom: 28 }}>Manage credentials, bot behavior, and system status.</p>

        {/* Password change */}
        <Section title="Security — Change Password">
          <form onSubmit={changePassword} style={{ maxWidth: 380 }}>
            <Field label="Current Password">
              <input
                type="password" required style={inputStyle}
                value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                onFocus={e => e.target.style.borderColor = '#25d366'}
                onBlur={e => e.target.style.borderColor = '#30363d'}
              />
            </Field>
            <Field label="New Password">
              <input
                type="password" required style={inputStyle}
                value={pwForm.newPw} onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))}
                onFocus={e => e.target.style.borderColor = '#25d366'}
                onBlur={e => e.target.style.borderColor = '#30363d'}
              />
            </Field>
            <Field label="Confirm New Password">
              <input
                type="password" required style={inputStyle}
                value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                onFocus={e => e.target.style.borderColor = '#25d366'}
                onBlur={e => e.target.style.borderColor = '#30363d'}
              />
            </Field>
            {pwMsg.text && (
              <div style={{ fontSize: 12, color: pwMsg.ok ? '#25d366' : '#f85149', marginBottom: 12 }}>{pwMsg.text}</div>
            )}
            <button type="submit" disabled={pwLoading} style={{ ...btnPrimary, opacity: pwLoading ? 0.6 : 1 }}>
              {pwLoading ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        </Section>

        {/* Bot controls */}
        <Section title="Bot Controls">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <div>
              <div style={{ fontSize: 14, color: '#e6edf3', fontWeight: 500 }}>Auto-Reply Bot</div>
              <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                {botEnabled ? 'Bot is active — replying to new messages.' : 'Bot is paused — no auto-replies.'}
              </div>
            </div>
            <button
              onClick={toggleBot}
              disabled={botLoading}
              style={botEnabled ? { ...btnDanger, opacity: botLoading ? 0.6 : 1 } : { ...btnPrimary, opacity: botLoading ? 0.6 : 1 }}
            >
              {botLoading ? '…' : botEnabled ? 'Pause All' : 'Resume All'}
            </button>
          </div>
        </Section>

        {/* System info */}
        <Section title="System Status">
          {sysStatus ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Auto-Reply Worker', ok: true },
                { label: 'Paused Chats', value: sysStatus.paused_chats?.length ?? 0 },
                { label: 'Auto-Reply Rules', value: sysStatus.auto_reply_count ?? '—' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #21262d' }}>
                  <span style={{ fontSize: 13, color: '#8b949e' }}>{item.label}</span>
                  {item.ok !== undefined ? (
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#25d366', background: '#0d2818', padding: '2px 8px', borderRadius: 4 }}>Active</span>
                  ) : (
                    <span style={{ fontSize: 13, color: '#e6edf3', fontWeight: 600 }}>{item.value}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#8b949e', fontSize: 13 }}>Loading system status…</div>
          )}
        </Section>

        {/* Info box */}
        <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '16px 20px', fontSize: 12, color: '#8b949e', lineHeight: 1.6 }}>
          <strong style={{ color: '#e6edf3' }}>Production tip:</strong> Set a strong <code style={{ background: '#0d1117', padding: '1px 5px', borderRadius: 3, color: '#25d366' }}>SECRET_KEY</code> in your <code style={{ background: '#0d1117', padding: '1px 5px', borderRadius: 3, color: '#25d366' }}>.env</code> file on the server. Never use the default value in production.
        </div>
      </div>
    </div>
  );
}
