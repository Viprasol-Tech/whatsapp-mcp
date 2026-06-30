import { useState, useEffect, useCallback } from 'react';
import './App.css';
import NavSidebar from './components/NavSidebar';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import QRScreen from './components/QRScreen';
import TopBar from './components/TopBar';
import LoginScreen from './components/LoginScreen';
import AutoReplyPanel from './components/AutoReplyPanel';
import Dashboard from './components/Dashboard';
import LeadsView from './components/LeadsView';
import AdminView from './components/AdminView';
import NotificationsPanel from './components/NotificationsPanel';
import Toaster, { toast } from './components/Toast';

const API = '/api';

function authHeaders() {
  const token = localStorage.getItem('wa_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path, opts = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('wa_token'));
  const [status, setStatus] = useState({ connected: false, phone: '' });
  const [waAuthenticated, setWaAuthenticated] = useState(false);
  const [chats, setChats] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAutoReply, setShowAutoReply] = useState(false);
  const [pausedChats, setPausedChats] = useState([]);
  const [activeView, setActiveView] = useState('dashboard');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  function handleLogin(t) { setToken(t); }
  function handleLogout() { localStorage.removeItem('wa_token'); setToken(null); }

  // Poll connection status
  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        const r = await apiFetch('/status');
        if (r.status === 401) { handleLogout(); return; }
        if (r.ok) {
          const data = await r.json();
          setStatus(data);
          setWaAuthenticated(!!data.connected);
        }
      } catch (_) {}
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [token]);

  // Poll notifications count
  useEffect(() => {
    if (!token || !waAuthenticated) return;
    const poll = async () => {
      try {
        const r = await apiFetch('/notifications');
        if (r.ok) {
          const data = await r.json();
          setNotificationCount(Array.isArray(data) ? data.length : 0);
        }
      } catch (_) {}
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [token, waAuthenticated]);

  // Fetch paused chats
  useEffect(() => {
    if (!token || !waAuthenticated) return;
    const load = async () => {
      try {
        const r = await apiFetch('/worker/status');
        if (r.ok) {
          const data = await r.json();
          setPausedChats(data.paused_chats || []);
        }
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [token, waAuthenticated]);

  const toggleBotForChat = useCallback(async () => {
    if (!activeChat) return;
    const jid = activeChat.jid;
    const isPaused = pausedChats.includes(jid);
    const endpoint = isPaused ? '/worker/resume' : '/worker/pause';
    try {
      const r = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid }),
      });
      if (r.ok) {
        setPausedChats(prev => isPaused ? prev.filter(j => j !== jid) : [...prev, jid]);
      }
    } catch (_) { toast.error('Network error'); }
  }, [activeChat, pausedChats]);

  // Load chat list
  useEffect(() => {
    if (!token || !waAuthenticated) return;
    const load = async () => {
      try {
        const r = await apiFetch('/chats?limit=50&page=0');
        if (r.ok) {
          const data = await r.json();
          setChats(Array.isArray(data) ? data : []);
        }
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [token, waAuthenticated]);

  const parseMessages = useCallback((raw) => {
    if (!raw || typeof raw !== 'string') return [];
    const lines = raw.split('\n').filter(l => l.trim());
    return lines.map((line, i) => {
      const tsMatch = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
      const timestamp = tsMatch ? tsMatch[1] : '';
      const rest = tsMatch ? line.slice(tsMatch[0].length).trim() : line;
      const withoutChat = rest.replace(/^Chat:\s*\S+\s*/, '');
      const fromMatch = withoutChat.match(/From:\s*([^:]+):\s*([\s\S]*)/);
      let sender = '', text = withoutChat;
      if (fromMatch) { sender = fromMatch[1].trim(); text = fromMatch[2].trim(); }
      return { id: i, timestamp, sender, text, isSent: sender.toLowerCase() === 'me' };
    }).filter(m => m.text);
  }, []);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat || !token) { setMessages([]); return; }
    let cancelled = false;
    let firstLoad = true;
    const load = async () => {
      if (firstLoad) { setLoadingMessages(true); firstLoad = false; }
      try {
        const r = await apiFetch(`/messages?chat_jid=${encodeURIComponent(activeChat.jid)}&limit=50`);
        if (r.ok && !cancelled) {
          const data = await r.json();
          setMessages(parseMessages(data.messages || ''));
        }
      } catch (_) {}
      if (!cancelled) setLoadingMessages(false);
    };
    load();
    const id = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeChat, token, parseMessages]);

  const sendMessage = useCallback(async (text) => {
    if (!activeChat || !text.trim()) return false;
    try {
      const r = await apiFetch('/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: activeChat.jid, message: text }),
      });
      return !!(await r.json()).success;
    } catch (_) { toast.error('Network error'); return false; }
  }, [activeChat, token]);

  const filteredChats = searchQuery && chats
    ? chats.filter(c =>
        (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.last_message || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : chats;

  // Handle select chat from other views
  const handleSelectChat = useCallback((chat) => {
    setActiveChat(chat);
    setActiveView('whatsapp');
  }, []);

  // --- Render gates ---
  if (!token) return <LoginScreen onLogin={handleLogin} />;
  if (!waAuthenticated) return <QRScreen onAuthenticated={() => setWaAuthenticated(true)} token={token} />;

  return (
    <div className="app">
      {/* Left nav sidebar */}
      <NavSidebar
        activeView={activeView}
        onChangeView={setActiveView}
        status={status}
        notificationCount={notificationCount}
        onLogout={handleLogout}
      />

      {/* Right content area */}
      <div className="content-area">
        {activeView === 'whatsapp' ? (
          <>
            {/* Chat list panel */}
            <div className="chat-panel">
              <TopBar
                status={status}
                onLogout={handleLogout}
                onToggleAutoReply={() => setShowAutoReply(v => !v)}
                notificationCount={notificationCount}
                onToggleNotifications={() => setShowNotifications(v => !v)}
              />
              <Sidebar
                chats={filteredChats}
                activeChat={activeChat}
                onSelectChat={setActiveChat}
                searchQuery={searchQuery}
                onSearch={setSearchQuery}
              />
            </div>
            {/* Chat window */}
            <div className="main-panel">
              {activeChat ? (
                <ChatWindow
                  chat={activeChat}
                  messages={messages}
                  loading={loadingMessages}
                  onSend={sendMessage}
                  botPaused={pausedChats.includes(activeChat.jid)}
                  onToggleBot={toggleBotForChat}
                />
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">💬</div>
                  <h2>WhatsApp</h2>
                  <p>Select a conversation from the list to start messaging</p>
                </div>
              )}
            </div>
          </>
        ) : activeView === 'dashboard' ? (
          <Dashboard token={token} onSelectChat={handleSelectChat} view="dashboard" />
        ) : activeView === 'leads' ? (
          <LeadsView token={token} onSelectChat={handleSelectChat} />
        ) : activeView === 'admin' ? (
          <AdminView token={token} />
        ) : null}
      </div>

      {/* Overlay panels */}
      {showAutoReply && (
        <AutoReplyPanel token={token} onClose={() => setShowAutoReply(false)} />
      )}
      {showNotifications && (
        <NotificationsPanel
          token={token}
          onClose={() => setShowNotifications(false)}
          onSelectChat={(chat) => { setActiveChat(chat); setShowNotifications(false); setActiveView('whatsapp'); }}
        />
      )}
      <Toaster />
    </div>
  );
}
