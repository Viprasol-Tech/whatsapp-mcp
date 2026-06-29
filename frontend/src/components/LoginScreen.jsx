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
      height: '100vh', background: '#0a0e13',
    }}>
      <div style={{
        background: '#111b21', borderRadius: 12, padding: '40px 36px',
        width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
      }}>
        <div style={{ fontSize: 48 }}>💬</div>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#e9edef', margin: 0, fontWeight: 600 }}>WhatsApp MCP</h2>
          <p style={{ color: '#8696a0', margin: '6px 0 0', fontSize: 13 }}>Enter dashboard password</p>
        </div>
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            style={{
              background: '#2a3942', border: 'none', borderRadius: 8,
              padding: '12px 16px', color: '#e9edef', fontSize: 15,
              outline: 'none', width: '100%', boxSizing: 'border-box',
            }}
          />
          {error && <p style={{ color: '#f15c6d', fontSize: 12, margin: 0 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              background: loading || !password ? '#2a3942' : '#00a884',
              color: loading || !password ? '#8696a0' : '#fff',
              border: 'none', borderRadius: 8, padding: '12px',
              fontSize: 15, fontWeight: 600, cursor: loading || !password ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
