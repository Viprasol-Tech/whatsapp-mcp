import React, { useState } from 'react';

export default function SendForm({ onSend, disabled }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || sending || disabled) return;
    setSending(true);
    try {
      await onSend(msg);
      setText('');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        gap: '10px',
        padding: '14px 16px',
        borderTop: '1px solid #1a1f2e',
        background: '#161b27',
      }}
    >
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Select a chat first…' : 'Type a message…'}
        disabled={disabled || sending}
        style={{
          flex: 1,
          background: '#1e2433',
          border: '1px solid #2a3044',
          borderRadius: '22px',
          padding: '10px 16px',
          color: '#e8eaf0',
          fontSize: '14px',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.target.style.borderColor = '#25d366'; }}
        onBlur={e => { e.target.style.borderColor = '#2a3044'; }}
      />
      <button
        type="submit"
        disabled={disabled || sending || !text.trim()}
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          border: 'none',
          background: disabled || !text.trim() ? '#2a3044' : '#25d366',
          color: disabled || !text.trim() ? '#5a6478' : '#0f1117',
          cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: '18px',
          transition: 'background 0.15s',
        }}
        title="Send"
      >
        {sending ? '…' : '➤'}
      </button>
    </form>
  );
}
