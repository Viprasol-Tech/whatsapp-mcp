import { useState, useEffect } from 'react';

let _addToast = null;
export function toast(msg, type = 'info') {
  if (_addToast) _addToast({ msg, type, id: Date.now() });
}
toast.error = (msg) => toast(msg, 'error');
toast.success = (msg) => toast(msg, 'success');

export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    _addToast = (t) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3500);
    };
    return () => { _addToast = null; };
  }, []);

  if (!toasts.length) return null;

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 500,
          maxWidth: '320px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          background: t.type === 'error' ? '#2a1215' : t.type === 'success' ? '#1a2e1a' : '#1c2128',
          color: t.type === 'error' ? '#f85149' : t.type === 'success' ? '#3fb950' : '#e6edf3',
          border: `1px solid ${t.type === 'error' ? '#f85149' : t.type === 'success' ? '#3fb950' : '#30363d'}`,
          animation: 'slideIn 0.2s ease',
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
