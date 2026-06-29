import React, { useEffect, useState } from 'react';

export default function QRModal() {
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch('/api/qr');
          if (!res.ok) throw new Error('Failed to fetch QR');
          const data = await res.json();
          if (data.authenticated) {
            // Parent will unmount this modal once status updates
            break;
          }
          if (!cancelled) setQr(data.qr || null);
        } catch (err) {
          if (!cancelled) setError('Could not load QR code. Retrying…');
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    poll();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#1e2433',
        borderRadius: '16px',
        padding: '40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        maxWidth: '360px',
        width: '90%',
      }}>
        {/* WhatsApp icon */}
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#25d366',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
        }}>
          💬
        </div>

        <h2 style={{ color: '#e8eaf0', fontSize: '20px', fontWeight: 700, margin: 0 }}>
          Scan with WhatsApp
        </h2>
        <p style={{ color: '#7a8499', fontSize: '13px', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
          Open WhatsApp on your phone → Linked Devices → Link a Device
        </p>

        {error && !qr && (
          <div style={{ color: '#ff4d4f', fontSize: '13px', textAlign: 'center' }}>{error}</div>
        )}

        {qr ? (
          <div style={{
            padding: '12px',
            background: '#fff',
            borderRadius: '12px',
            lineHeight: 0,
          }}>
            <img
              src={`data:image/png;base64,${qr}`}
              alt="WhatsApp QR Code"
              style={{ width: '220px', height: '220px', display: 'block' }}
            />
          </div>
        ) : (
          <div style={{
            width: '244px',
            height: '244px',
            background: '#161b27',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#5a6478',
            fontSize: '13px',
          }}>
            Loading QR…
          </div>
        )}

        <p style={{ color: '#5a6478', fontSize: '11px', margin: 0 }}>
          QR refreshes every 3 seconds
        </p>
      </div>
    </div>
  );
}
