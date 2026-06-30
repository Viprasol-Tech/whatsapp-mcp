import { useState } from 'react';

export default function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {  // nginx proxies /api/auth/login → FastAPI /auth/login
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError('Wrong password. Try again.');
        return;
      }
      const { token } = await res.json();
      localStorage.setItem('wa_token', token);
      onLogin(token);
    } catch {
      setError('Cannot reach server. Is the API running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#0d1117',
    }}>
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 12,
        padding: '40px',
        width: '100%',
        maxWidth: 380,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        {/* Brand header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#25d366', letterSpacing: '-0.5px', marginBottom: 6 }}>
            🤖 Viprasol Tech
          </div>
          <div style={{ fontSize: 13, color: '#8b949e', fontWeight: 500 }}>
            WhatsApp Sales Bot
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: '100%', height: 1, background: '#30363d' }} />

        <div style={{ textAlign: 'center', width: '100%' }}>
          <p style={{ color: '#8b949e', margin: '0 0 20px', fontSize: 13 }}>Enter dashboard password</p>
          <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{
                background: '#21262d', border: '1px solid #30363d', borderRadius: 8,
                padding: '12px 16px', color: '#e6edf3', fontSize: 15,
                outline: 'none', width: '100%', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = '#25d366'; }}
              onBlur={e => { e.target.style.borderColor = '#30363d'; }}
            />
            {error && <p style={{ color: '#f85149', fontSize: 12, margin: 0, textAlign: 'left' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading || !password}
              style={{
                background: loading || !password ? '#21262d' : '#25d366',
                color: loading || !password ? '#8b949e' : '#0d1117',
                border: 'none', borderRadius: 8, padding: '12px',
                fontSize: 15, fontWeight: 700, cursor: loading || !password ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s, color 0.2s',
                marginTop: 4,
              }}
            >
              {loading ? 'Logging in…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
