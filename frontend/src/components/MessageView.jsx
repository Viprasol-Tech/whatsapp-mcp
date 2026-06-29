import React, { useEffect, useRef } from 'react';

export default function MessageView({ messages, loading }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (loading) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#5a6478',
        fontSize: '14px',
      }}>
        Loading messages…
      </div>
    );
  }

  if (!messages) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#5a6478',
        fontSize: '14px',
      }}>
        Select a chat to view messages
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '16px 20px',
      fontFamily: '"Courier New", Courier, monospace',
      fontSize: '13px',
      lineHeight: '1.7',
      color: '#c8cdd8',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {messages}
      <div ref={bottomRef} />
    </div>
  );
}
