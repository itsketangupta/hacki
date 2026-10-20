import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './style.css';

const STARTER_PROMPTS = [
  ['🦖', 'What is Hack Club?', 'What is Hack Club?'],
  ['🚀', 'What is YSWS?', 'What is YSWS? (You Ship, We Ship)'],
  ['🌲', 'Where is HQ located?', 'Where is HQ located?'],
  ['🎓', 'Who are gappies?', 'Who are gappies?'],
  ['🤝', 'How to contribute?', 'How to contribute Hack Club?'],
  ['💳', 'What is HCB?', 'What is HCB? (Hack Club Bank)'],
  ['🚀', 'How to make a YSWS?', 'How do I make a YSWS?'],
  ['🪪', 'How to verify ID?', 'How to verify ID?'],
  ['🛠️', 'Free tools (AI, Nest)', 'Hey is Hack Club give us free tools like ai.hackclub.com hackclub.app?'],
  ['🌟', 'How to become a gappie?', 'How to become gappie?']
];

const themeOptions = [
  { id: 'system', label: 'System theme', icon: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></> },
  { id: 'light', label: 'Light theme', icon: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></> },
  { id: 'dark', label: 'Dark theme', icon: <path d="M20.4 15.5A8.5 8.5 0 0 1 8.5 3.6 8.8 8.8 0 1 0 20.4 15.5Z"/> }
];

function Icon({ name, size = 20 }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    close: <path d="M18 6 6 18M6 6l12 12" />,
    menu: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    edit: <><path d="M12 20h9"/><path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v7m6-7v7"/></>,
    send: <><path d="M12 19V5M5 12l7-7 7 7"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
  };
  return <svg {...shared}>{paths[name]}</svg>;
}

function newChat() {
  return { id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, title: 'New chat', messages: [], createdAt: Date.now() };
}

function getLocalChats(user) {
  const key = `hacki_chats_${user?.id || user?.email || 'user'}`;
  try {
    const current = localStorage.getItem(key);
    if (current) return JSON.parse(current) || [];
    const legacy = localStorage.getItem('hacki_chats') || localStorage.getItem('hackwire_chats');
    if (legacy) {
      const parsed = JSON.parse(legacy) || [];
      localStorage.setItem(key, JSON.stringify(parsed));
      localStorage.removeItem('hacki_chats');
      localStorage.removeItem('hackwire_chats');
      return parsed;
    }
  } catch {}
  return [];
}

async function importChat(chat) {
  const response = await fetch('/api/chat/sessions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionKey: chat.id, title: chat.title || 'New chat', messages: chat.messages || [] })
  });
  if (!response.ok) throw new Error('Could not sync this conversation.');
}

function Message({ message }) {
  const [visibleText, setVisibleText] = useState(message.animate ? '' : message.text);
  const [finished, setFinished] = useState(!message.animate);
  const [feedback, setFeedback] = useState(message.feedback ?? null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  useEffect(() => {
    if (!message.animate) {
      setVisibleText(message.text);
      setFinished(true);
      return undefined;
    }
    const words = String(message.text).match(/\S+\s*/g) || [];
    const delay = Math.min(20, Math.max(7, 5000 / Math.max(words.length, 1)));
    let shown = 0;
    const timer = window.setInterval(() => {
      shown += 1;
      setVisibleText(words.slice(0, shown).join(''));
      if (shown >= words.length) {
        window.clearInterval(timer);
        setFinished(true);
      }
    }, delay);
    return () => window.clearInterval(timer);
  }, [message.id, message.text, message.animate]);

  const snapshot = message.role === 'assistant' ? message.sources?.find(source => source.type === 'data_snapshot') : null;
  const sources = (message.sources || []).filter(source => source.type !== 'data_snapshot');
  const dates = snapshot?.dataDates;
  const dateLabels = dates ? [
    dates.team && `Team ${dates.team}`,
    dates.ysws && `YSWS ${dates.ysws}`,
    dates.slack?.snapshot && `Slack snapshot ${dates.slack.snapshot}`,
    dates.slack?.batch && `Slack batch ${dates.slack.batch}`
  ].filter(Boolean) : [];

  async function copyResponse() {
    try { await navigator.clipboard.writeText(message.text); } catch {}
  }

  async function rateAnswer(rating) {
    if (!message.dbId || feedbackBusy) return;
    setFeedbackBusy(true);
    try {
      const response = await fetch('/api/chat/feedback', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.dbId, rating })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not save feedback.');
      setFeedback(data.rating);
    } catch (error) {
      console.warn('[Hacki] Could not save answer feedback:', error.message);
    } finally {
      setFeedbackBusy(false);
    }
  }

  return <div className={`message-item ${message.role}`}>
    {message.role === 'assistant' && <img className="assistant-avatar" src="/hacki-logo.png" alt="Hacki" />}
    <div className={`message-body ${message.animate && !finished ? 'streaming' : ''}`}>
      {message.role === 'assistant' && !finished
        ? visibleText
        : message.role === 'assistant'
          ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{message.text}</ReactMarkdown>
          : message.text}
      {finished && message.role === 'assistant' && (sources.length > 0 || dateLabels.length > 0) && <div className="msg-sources-row">
        {sources.map((source, index) => <a className="msg-source-tag" href={source.url} key={`${source.url}-${index}`} target="_blank" rel="noopener noreferrer">
          🔗 {source.title}{source.publishedDate && <small className="source-post-date">{source.publishedDate}</small>}
        </a>)}
        {dateLabels.length > 0 && <span className="data-snapshot-label" title="Dates refer to the saved source snapshots and latest successful Slack batch.">Data dates · {dateLabels.join(' · ')}</span>}
      </div>}
      {message.role === 'assistant' && finished && <div className="msg-actions"><button className="action-btn" title="Copy response" onClick={copyResponse}><Icon name="copy" size={14}/><span>Copy</span></button>{message.dbId && <><button className={`action-btn feedback-btn ${feedback === 1 ? 'selected' : ''}`} title="Helpful answer" aria-label="Helpful answer" disabled={feedbackBusy} onClick={() => rateAnswer(1)}>👍</button><button className={`action-btn feedback-btn ${feedback === -1 ? 'selected' : ''}`} title="Not helpful" aria-label="Not helpful" disabled={feedbackBusy} onClick={() => rateAnswer(-1)}>👎</button>{feedback !== null && <span className="feedback-thanks">Thanks for the feedback</span>}</>}</div>}
    </div>
  </div>;
}

function TypingIndicator() {
  return <div className="message-item assistant">
    <img className="assistant-avatar" src="/hacki-logo.png" alt="Hacki" />
    <div className="message-body"><div className="thinking-label">Hacki is thinking</div><div className="typing-dots"><span className="dot"/><span className="dot"/><span className="dot"/></div></div>
  </div>;
}

function AuthModal() {
  return <div className="auth-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <div className="auth-modal-card">
      <div className="auth-modal-header">
        <div className="auth-modal-logo-wrapper"><img src="/hacki-logo.png" alt="Hacki" className="auth-modal-logo" /></div>
        <h2 className="auth-modal-title" id="auth-title">Welcome to Hacki</h2>
        <p className="auth-modal-subtitle">Your Hack Club AI assistant and community companion</p>
      </div>
      <div className="auth-modal-features">
        <div className="auth-feature-row"><div className="auth-feature-icon">💬</div><div className="auth-feature-info"><strong>Chat with Hacki</strong><span>Sign in with your Hack Club account to start a conversation.</span></div></div>
        <div className="auth-feature-row"><div className="auth-feature-icon">🚀</div><div className="auth-feature-info"><strong>Hack Club knowledge</strong><span>Get help with YSWS programs, tools, community opportunities, and more.</span></div></div>
        <div className="auth-feature-row"><div className="auth-feature-icon">🔒</div><div className="auth-feature-info"><strong>Your saved conversations</strong><span>Your chat history syncs to your Hacki account across devices.</span></div></div>
      </div>
      <div className="auth-modal-actions"><a href="/auth/login" className="auth-modal-login-btn"><img src="/hackclub-flag.svg" alt="" className="auth-modal-btn-flag"/><span>Sign in with Hack Club</span></a></div>
      <div className="auth-modal-footer">Powered by <a href="https://hackclub.com" target="_blank" rel="noopener noreferrer">Hack Club</a></div>
    </div>
  </div>;
}

function OpportunityFinder() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (nextQuery = query, nextType = type) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ type: nextType });
      if (nextQuery.trim()) params.set('q', nextQuery.trim());
      const response = await fetch(`/api/opportunities?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Could not search opportunities.');
      setItems(data.opportunities || []);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query, type]);

  useEffect(() => { search('', 'all'); }, []);

  const filters = [['all', 'All'], ['roles', 'Roles'], ['programs', 'Programs & YSWS'], ['events', 'Events']];
  return <section className="opportunity-finder" aria-labelledby="opportunity-title">
    <div className="opportunity-heading">
      <div><span className="opportunity-eyebrow">LIVE FROM HACK CLUB SOURCES</span><h1 id="opportunity-title">Find your next opportunity</h1>
        <p>Search recent Slack bulletins for programs, events, roles, bounties, and calls for help. Every result links to its original post.</p></div>
    </div>
    <form className="opportunity-search" onSubmit={event => { event.preventDefault(); search(); }}>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Try: remote reviewer, hardware, game YSWS…" aria-label="Search Hack Club opportunities" />
      <button className="opportunity-search-button" type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
    </form>
    <div className="opportunity-filters" role="group" aria-label="Opportunity type">
      {filters.map(([id, label]) => <button key={id} type="button" className={type === id ? 'selected' : ''} onClick={() => { setType(id); search(query, id); }}>{label}</button>)}
    </div>
    <div className="opportunity-results-heading"><h2>{searched ? `${items.length} matching posts` : 'Recent posts'}</h2><span>Old posts are labeled; confirm availability in the source.</span></div>
    {error && <div className="opportunity-state">{error}</div>}
    {!error && !loading && items.length === 0 && <div className="opportunity-state">No matching posts in the current Slack snapshot. Try a broader search or check back after the next sync.</div>}
    <div className="opportunity-grid">{items.map(item => <article className="opportunity-card" key={item.id || item.url}>
      <div className="opportunity-card-meta"><span>#{item.channel}</span><span>{item.publishedDate || 'Date unavailable'}</span></div>
      <h3>{item.title}</h3>
      <p>{String(item.summary || 'Open the source post for details.').slice(0, 380)}{String(item.summary || '').length > 380 ? '…' : ''}</p>
      <div className={`opportunity-status ${item.status === 'Past event' || item.status === 'Deadline passed' ? 'stale' : ''}`}>{item.status}</div>
      <div className="opportunity-card-actions">{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">Open source <span aria-hidden="true">↗</span></a> : <span>Source link unavailable</span>}{item.eventDate && <span>Event: {item.eventDate}</span>}</div>
    </article>)}</div>
    {loading && <div className="opportunity-state">Searching the latest indexed posts…</div>}
    <p className="opportunity-freshness">This view searches Hacki’s collected Slack snapshot. It can’t guarantee a post is still open; check deadlines and eligibility at the linked source.</p>
  </section>;
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('hacki-theme') || 'system'; } catch { return 'system'; }
  });
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingChatId, setPendingChatId] = useState(null);
  const [opportunitiesOpen, setOpportunitiesOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 768);
  const textareaRef = useRef(null);
  const conversationRef = useRef(null);

  const activeChat = useMemo(() => chats.find(chat => chat.id === activeId) || chats[0] || null, [chats, activeId]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('hacki-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(response => response.json())
      .then(data => setUser(data.ok ? data.user : null))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (!user) { setChats([]); setActiveId(null); return; }
    let cancelled = false;
    async function loadChats() {
      const local = getLocalChats(user);
      try {
        let response = await fetch('/api/chat/sessions', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load conversations.');
        let data = await response.json();
        const keys = new Set((data.sessions || []).map(session => session.session_key));
        for (const chat of local) if (chat?.id && !keys.has(chat.id)) await importChat(chat);
        response = await fetch('/api/chat/sessions', { credentials: 'include', cache: 'no-store' });
        data = await response.json();
        const loaded = await Promise.all((data.sessions || []).map(async session => {
          const detail = await fetch(`/api/chat/sessions/${encodeURIComponent(session.session_key)}`, { credentials: 'include', cache: 'no-store' });
          if (!detail.ok) return null;
          const body = await detail.json();
          return { id: session.session_key, title: session.title || 'New chat', createdAt: session.created_at, messages: (body.messages || []).map((message, i) => ({ id: `${session.session_key}-${i}`, dbId: message.id, feedback: message.feedback, role: message.role, text: message.content, sources: message.sources || [] })) };
        }));
        const usable = loaded.filter(Boolean);
        if (!cancelled) {
          if (usable.length) { setChats(usable); setActiveId(usable[0].id); }
          else {
            const chat = newChat();
            setChats([chat]); setActiveId(chat.id);
            importChat(chat).catch(error => console.warn('[Hacki] Could not create cloud chat:', error.message));
          }
        }
      } catch (error) {
        console.warn('[Hacki] Could not sync chat history:', error.message);
        if (!cancelled) {
          const fallback = local.length ? local : [newChat()];
          setChats(fallback);
          setActiveId(fallback[0].id);
        }
      }
    }
    loadChats();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user || !chats.length) return;
    try { localStorage.setItem(`hacki_chats_${user.id || user.email || 'user'}`, JSON.stringify(chats)); } catch {}
  }, [chats, user]);

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [activeChat?.messages?.length, pendingChatId]);

  const updateChat = useCallback((chatId, updater) => {
    setChats(current => current.map(chat => chat.id === chatId ? updater(chat) : chat));
  }, []);

  function createNewChat() {
    setOpportunitiesOpen(false);
    const chat = newChat();
    setChats(current => [chat, ...current]);
    setActiveId(chat.id);
    if (window.innerWidth <= 768) setSidebarOpen(false);
    if (user) importChat(chat).catch(error => console.warn('[Hacki] Could not create cloud chat:', error.message));
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function removeChat(chatId, event) {
    event.stopPropagation();
    fetch(`/api/chat/sessions/${encodeURIComponent(chatId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    const remaining = chats.filter(chat => chat.id !== chatId);
    if (!remaining.length) {
      const replacement = newChat();
      setChats([replacement]);
      setActiveId(replacement.id);
      if (user) importChat(replacement).catch(() => {});
      return;
    }
    setChats(remaining);
    if (activeId === chatId) setActiveId(remaining[0].id);
  }

  async function handleSend(suppliedText) {
    if (!user) return;
    const text = String(suppliedText ?? draft).trim();
    if (!text || sending || !activeChat) return;
    const chatId = activeChat.id;
    const firstMessage = activeChat.messages.length === 0;
    const title = firstMessage ? `${text.slice(0, 30)}${text.length > 30 ? '...' : ''}` : activeChat.title;
    const userMessage = { id: `${Date.now()}-user`, role: 'user', text };
    updateChat(chatId, chat => ({ ...chat, title, messages: [...chat.messages, userMessage] }));
    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(true);
    setPendingChatId(chatId);

    try {
      const history = [...activeChat.messages, userMessage].slice(-40).map(message => ({ role: message.role, content: message.text }));
      const response = await fetch('/api/chat', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, chatKey: chatId, title })
      });
      if (response.status === 401) {
        setUser(null);
        return;
      }
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Something went wrong.');
      updateChat(chatId, chat => ({ ...chat, title, messages: [...chat.messages, { id: `${Date.now()}-assistant`, dbId: data.answerMessageId, role: 'assistant', text: data.answer, sources: data.sources || [], suggestions: data.suggestedQueries || [], animate: true }] }));
    } catch (error) {
      updateChat(chatId, chat => ({ ...chat, messages: [...chat.messages, { id: `${Date.now()}-error`, role: 'assistant', text: `⚠️ ${error.message}` }] }));
    } finally {
      setSending(false);
      setPendingChatId(null);
      textareaRef.current?.focus();
    }
  }

  function handleTextareaChange(event) {
    setDraft(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function logout() {
    setUser(null);
    setChats([]);
    setActiveId(null);
  }

  const onFreshChat = activeChat?.messages?.length === 0;
  const profileInitials = (user?.name || 'HC').slice(0, 2).toUpperCase();

  return <>
    <a href="https://hackclub.com" target="_blank" rel="noopener noreferrer" className="hackclub-flag-link" title="Visit Hack Club"><img src="/hackclub-flag.svg" alt="Hack Club flag" /></a>
    <div className="app-layout">
      {sidebarOpen && <button className="sidebar-mobile-backdrop" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : 'closed'}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-brand-left"><img src="/hacki-logo.png" alt="Hacki" className="hacki-brand-logo"/><span className="sidebar-brand-name">Hacki</span></div>
            <button className="sidebar-toggle-btn" title="Close sidebar" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><Icon name="close" /></button>
          </div>
          <button className="new-chat-btn" onClick={createNewChat}><Icon name="plus" size={18}/><span>New chat</span></button>
          <button className={`new-chat-btn opportunity-nav-btn ${opportunitiesOpen ? 'selected' : ''}`} onClick={() => { setOpportunitiesOpen(true); if (window.innerWidth <= 768) setSidebarOpen(false); }}><Icon name="search" size={18}/><span>Find opportunities</span></button>
        </div>
        <div className="sidebar-chats">
          {chats.length === 0 ? <div className="chat-history-empty-notice">{authReady && user ? 'Loading your conversations…' : 'Sign in to see your conversations'}</div> : chats.map(chat => <div key={chat.id} className={`chat-history-item ${chat.id === activeChat?.id ? 'active' : ''}`} onClick={() => { setActiveId(chat.id); if (window.innerWidth <= 768) setSidebarOpen(false); }}>
            <span className="chat-history-title">{chat.title || 'New chat'}</span><button className="chat-history-delete" title="Delete chat" aria-label={`Delete ${chat.title || 'chat'}`} onClick={event => removeChat(chat.id, event)}><Icon name="trash" size={14}/></button>
          </div>)}
        </div>
        <div className="sidebar-bottom"><div className="auth-section">
          {!user ? <a href="/auth/login" className="hc-auth-btn"><img src="/hackclub-flag.svg" alt="" className="auth-btn-icon"/><span>Sign in with Hack Club</span></a> : <div className="user-profile-card">
            <div className="user-avatar">{user.avatar ? <img src={user.avatar} alt=""/> : profileInitials}</div>
            <div className="user-details"><div className="user-name">{user.name || 'Hack Clubber'}</div><div className="user-sub">{user.email || 'Hack Club Member'}</div>{user.slackId && <div className="user-slack-tag"><span className="slack-dot"/><span>Slack linked</span></div>}</div>
            <a href="/auth/logout" className="user-logout-btn" title="Sign out" aria-label="Sign out" onClick={logout}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></a>
          </div>}
        </div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button" title="Open sidebar" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><Icon name="menu"/></button><div className="model-badge"><img src="/hacki-logo.png" alt="" className="model-logo"/><span className="model-title">Hacki</span><span className="model-version">AI</span></div></div>
          <div className="topbar-right">
            <div className="theme-control" role="group" aria-label="Choose appearance">{themeOptions.map(option => <button key={option.id} type="button" className="theme-icon-btn" data-theme-choice={option.id} aria-label={option.label} title={option.label} aria-pressed={theme === option.id} onClick={() => setTheme(option.id)}><svg viewBox="0 0 24 24" aria-hidden="true">{option.icon}</svg></button>)}</div>
            {!user && authReady && <a href="/auth/login" className="topbar-login-btn">Sign in</a>}
            <button className="icon-button" title="New chat" aria-label="New chat" onClick={createNewChat}><Icon name="edit" size={18}/></button>
          </div>
        </header>

        {opportunitiesOpen ? <div className="conversation-container opportunity-container"><OpportunityFinder/></div> : <div className="conversation-container" ref={conversationRef}>
          {onFreshChat && <div className="empty-state">
            <div className="empty-logo-wrap"><img src="/hacki-logo.png" alt="Hacki" className="empty-hacki-logo"/></div>
            <h2 className="empty-title">Welcome to Hack Club!</h2><p className="empty-desc">I am Hacki, here to help you. Whichever question you have, ask me!</p>
            <div className="empty-prompts-grid">{STARTER_PROMPTS.map(([icon, label, query]) => <button key={label} className="empty-prompt-card" onClick={() => handleSend(query)}><span className="prompt-icon">{icon}</span><span className="prompt-text">{label}</span></button>)}</div>
          </div>}
          {activeChat?.messages?.length > 0 && <div className="messages-list">{activeChat.messages.map((message, index) => <Message key={message.id || `${activeChat.id}-${index}`} message={message}/>)}{pendingChatId === activeChat.id && <TypingIndicator/>}</div>}
        </div>}

        {!opportunitiesOpen && <div className="input-container"><div className="input-box">
          <textarea id="chat-input" ref={textareaRef} rows={1} placeholder={user ? 'Message Hacki…' : 'Sign in with Hack Club to chat'} disabled={!user || sending} value={draft} onChange={handleTextareaChange} onKeyDown={handleKeyDown} aria-label="Message Hacki" />
          <button className="send-btn" onClick={() => handleSend()} disabled={!user || sending || !draft.trim()} title="Send message" aria-label="Send message"><Icon name="send" size={18}/></button>
        </div><div className="disclaimer">Hacki can make mistakes. Check verified Hack Club sources on Slack &amp; <a href="https://hackclub.com" target="_blank" rel="noopener noreferrer">hackclub.com</a>.</div></div>}
      </main>
    </div>
    {authReady && !user && <AuthModal/>}
  </>;
}
