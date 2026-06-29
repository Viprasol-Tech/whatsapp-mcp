import { useState, useEffect } from 'react';

export default function QRScreen({ onAuthenticated }) {
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const token = localStorage.getItem('wa_token');
          const r = await fetch('/api/qr', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!r.ok) throw new Error('Failed to fetch QR');
          const data = await r.json();
          if (data.authenticated) {
            if (!cancelled) onAuthenticated();
            return;
          }
          if (!cancelled) {
            setQr(data.qr || null);
            setError(null);
          }
        } catch (err) {
          if (!cancelled) setError('Could not load QR code. Retrying…');
        }
        await new Promise(res => setTimeout(res, 3000));
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [onAuthenticated]);

  return (
    <div className="qr-screen">
      <div className="qr-title">Use WhatsApp on your computer</div>

      <div className="qr-card">
        <div className="qr-logo">WhatsApp MCP</div>
        {qr ? (
          <img
            src={`data:image/png;base64,${qr}`}
            alt="WhatsApp QR Code"
          />
        ) : error ? (
          <div style={{
            width: 220,
            height: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f0f0f0',
            borderRadius: 8,
            color: '#888',
            fontSize: 13,
            textAlign: 'center',
            padding: 16,
          }}>
            {error}
          </div>
        ) : (
          <div style={{
            width: 220,
            height: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f0f0f0',
            borderRadius: 8,
          }}>
            <div className="spinner" style={{ borderTopColor: '#00a884', borderColor: '#ccc' }} />
          </div>
        )}
      </div>

      <ol className="qr-steps">
        <li>
          <span className="qr-step-num">1</span>
          Open WhatsApp on your phone
        </li>
        <li>
          <span className="qr-step-num">2</span>
          Tap Menu or Settings and select Linked Devices
        </li>
        <li>
          <span className="qr-step-num">3</span>
          Tap Link a Device
        </li>
        <li>
          <span className="qr-step-num">4</span>
          Point your phone at this screen to scan the QR code
        </li>
      </ol>

      {!qr && !error && (
        <div className="qr-loading">Loading QR code…</div>
      )}
    </div>
  );
}
