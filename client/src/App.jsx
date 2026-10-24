import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import './style.css';

const STARTER_PROMPTS = [
  ['/icons/hackclub.png', 'What is Hack Club?', 'What is Hack Club?'],
  ['/icons/rocket.png', 'What is YSWS?', 'What is YSWS? (You Ship, We Ship)'],
  ['/icons/tree.png', 'Where is HQ located?', 'Where is HQ located?'],
  ['/icons/graduation.png', 'Who are gappies?', 'Who are gappies?'],
  ['/icons/handshake.png', 'How to contribute?', 'How to contribute Hack Club?'],
  ['/icons/card.png', 'What is HCB?', 'What is HCB? (Hack Club Bank)'],
  ['/icons/rocket.png', 'How to make a YSWS?', 'How do I make a YSWS?'],
  ['/icons/id.png', 'How to verify ID?', 'How to verify ID?'],
  ['/icons/wrench.png', 'Free tools (AI, Nest)', 'Hey is Hack Club give us free tools like ai.hackclub.com hackclub.app?'],
  ['/icons/star.png', 'How to become a gappie?', 'How to become gappie?']
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
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z" transform="translate(-2 -2)"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
  };
  return <svg {...shared}>{paths[name]}</svg>;
}

function SettingsModal({ theme, setTheme, preferences, onPreferenceChange, onNotificationChange, onClose, onExport, onClear, user, chatCount }) {
  useEffect(() => {
    const handleKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return <div className="settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-header"><div><span className="settings-eyebrow">HACKI PREFERENCES</span><h2 id="settings-title">Settings</h2></div><button className="icon-button" aria-label="Close settings" onClick={onClose}><Icon name="close" size={18}/></button></header>
      <div className="settings-content">
        <section className="settings-section"><h3>Appearance</h3><p>Choose how Hacki looks on this device.</p><label className="settings-row"><span><strong>Theme</strong><small>System follows your device setting.</small></span><select value={theme} onChange={event => setTheme(event.target.value)} aria-label="Theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></section>
        <section className="settings-section"><h3>General</h3><p>Choose how sending and notifications work.</p>
          <label className="settings-row"><span><strong>Press Enter to send</strong><small>When off, use Ctrl or ⌘ + Enter to send.</small></span><input type="checkbox" checked={preferences.enterToSend} onChange={event => onPreferenceChange('enterToSend', event.target.checked)} /></label>
          <label className="settings-row"><span><strong>Reply notifications</strong><small>Notify when a reply finishes while this tab is hidden.</small></span><input type="checkbox" checked={preferences.notifyWhenDone} onChange={event => onNotificationChange(event.target.checked)} /></label>
        </section>
        <section className="settings-section"><h3>Personalization</h3><p>Set how Hacki responds across your chats.</p>
          <label className="settings-row"><span><strong>Response style</strong><small>Sets the default tone and level of detail.</small></span><select value={preferences.responseStyle} onChange={event => onPreferenceChange('responseStyle', event.target.value)} aria-label="Response style"><option value="default">Default</option><option value="friendly">Friendly</option><option value="concise">Concise</option><option value="detailed">Detailed</option></select></label>
          <label className="settings-row"><span><strong>Response language</strong><small>Choose a default language for Hacki’s replies.</small></span><select value={preferences.responseLanguage} onChange={event => onPreferenceChange('responseLanguage', event.target.value)} aria-label="Response language"><option value="auto">Automatic</option><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="hi">Hindi</option><option value="pt">Portuguese</option></select></label>
          <label className="settings-instructions"><strong>Custom instructions</strong><small>Preferences Hacki should follow in every conversation.</small><textarea maxLength={2000} value={preferences.customInstructions} onChange={event => onPreferenceChange('customInstructions', event.target.value)} placeholder="For example: explain technical terms simply, and use examples from web development." /></label>
          <label className="settings-row"><span><strong>Show starter prompts</strong><small>Show suggested questions on a new chat.</small></span><input type="checkbox" checked={preferences.showStarterPrompts} onChange={event => onPreferenceChange('showStarterPrompts', event.target.checked)} /></label>
        </section>
        <section className="settings-section"><h3>Data controls</h3><p>Download or remove your saved Hacki conversations.</p>
          <div className="settings-row"><span><strong>Export conversations</strong><small>Download {chatCount} conversation{chatCount === 1 ? '' : 's'} as a JSON file.</small></span><button className="settings-action-btn" onClick={onExport} disabled={!chatCount}>Export</button></div>
          <div className="settings-row"><span><strong>Delete all conversations</strong><small>Remove saved conversations from this account.</small></span><button className="settings-action-btn danger" onClick={onClear} disabled={!chatCount}>Delete all</button></div>
        </section>
        <section className="settings-section"><h3>Keyboard shortcuts</h3><p><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>,</kbd> opens settings. The send shortcut follows your Enter preference.</p></section>
        <section className="settings-section settings-account"><h3>Account</h3><p>{user?.name || 'Not signed in'}{user?.email ? ` · ${user.email}` : ''}</p></section>
      </div>
    </section>
  </div>;
}

function AdminDashboard() {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/mentions', { credentials: 'include', cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load mentions.');
        return data;
      })
      .then(data => { if (!cancelled) setMentions(data.mentions || []); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return <section className="admin-dashboard">
    <div className="admin-heading"><div><span className="empty-kicker"><span className="empty-kicker-dot"/> ADMIN</span><h1>Hacki admin</h1><p>Review recent Slack mentions.</p></div><button className="admin-refresh-btn" onClick={() => { setLoading(true); setError(''); setRefreshKey(value => value + 1); }}>Refresh</button></div>
    <div className="admin-section-heading admin-mentions-heading"><div><h2>Slack mentions</h2><p>Last 7 days, including Hacki clarification replies.</p></div></div>
    {loading ? <div className="admin-empty">Loading mentions…</div> : error ? <div className="admin-empty admin-error">{error}</div> : mentions.length === 0 ? <div className="admin-empty">No mentions recorded in the last 7 days yet. New mentions will appear here.</div> : <div className="admin-mention-list">{mentions.map(mention => <article className="admin-mention-card" key={mention.event_key}>
      <div className="admin-mention-meta"><a href={mention.slackUrl} target="_blank" rel="noopener noreferrer">#{mention.channel_name || mention.channel_id}</a><time dateTime={new Date(mention.occurred_at * 1000).toISOString()}>{new Date(mention.occurred_at * 1000).toLocaleString()}</time></div>
      <p className="admin-mention-text">{mention.message_text}</p>
      {mention.reply_text && <div className="admin-mention-reply"><span>Hacki asked for clarification</span><p>{mention.reply_text}</p></div>}
      <div className="admin-mention-author">Mentioned by {mention.user_id || 'unknown user'}</div>
    </article>)}</div>}
  </section>;
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
          ? <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}>{message.text}</ReactMarkdown>
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

function TypingIndicator({ status, text }) {
  return <div className="message-item assistant">
    <img className="assistant-avatar" src="/hacki-logo.png" alt="Hacki" />
    <div className="message-body"><div className="activity-status" aria-live="polite">{status || 'Working…'}</div>{text ? <div className="streamed-answer">{text}</div> : <div className="typing-dots"><span className="dot"/><span className="dot"/><span className="dot"/></div>}</div>
  </div>;
}

async function readEventStream(response, onEvent) {
  if (!response.body) throw new Error('The server closed the response before sending an answer.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const dispatch = block => {
    let event = 'message';
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length) onEvent(event, JSON.parse(data.join('\n')));
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let boundary;
    while ((boundary = buffer.match(/\r?\n\r?\n/))) {
      const index = boundary.index;
      dispatch(buffer.slice(0, index));
      buffer = buffer.slice(index + boundary[0].length);
    }
    if (done) break;
  }
  if (buffer.trim()) dispatch(buffer);
}

function AuthModal() {
  const [emailUpdates, setEmailUpdates] = useState(false);
  const loginUrl = emailUpdates ? '/auth/login?email_updates=1' : '/auth/login';
  return <div className="auth-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
    <div className="auth-modal-card">
      <div className="auth-modal-header">
        <div className="auth-modal-logo-wrapper"><img src="/hacki-logo.png" alt="Hacki" className="auth-modal-logo" /></div>
        <h2 className="auth-modal-title" id="auth-title">Welcome to Hacki</h2>
        <p className="auth-modal-subtitle">Verify your Hack Club account by signing in first. Then Hacki can chat with you. Need help with verification? Ask freely in Hack Club Slack’s #help channel.</p>
      </div>
      <div className="auth-modal-features">
        <div className="auth-feature-row"><img className="auth-feature-icon" src="/icons/chat.png" alt=""/><div className="auth-feature-info"><strong>Verify to chat</strong><span>Sign in with your Hack Club account first. If verification gets stuck, ask for help in <a href="https://slack.hackclub.com" target="_blank" rel="noopener noreferrer">Hack Club Slack</a>.</span></div></div>
        <div className="auth-feature-row"><img className="auth-feature-icon" src="/icons/rocket.png" alt=""/><div className="auth-feature-info"><strong>Hack Club knowledge</strong><span>Get help with YSWS programs, tools, community opportunities, and more.</span></div></div>
        <div className="auth-feature-row"><img className="auth-feature-icon" src="/icons/lock.png" alt=""/><div className="auth-feature-info"><strong>Your saved conversations</strong><span>Your chat history syncs to your Hack Club account across devices.</span></div></div>
      </div>
      <label className="email-updates-consent"><input type="checkbox" checked={emailUpdates} onChange={event => setEmailUpdates(event.target.checked)}/><span>Email me occasional Hacki updates and announcements. Optional; I can unsubscribe anytime.</span></label>
      <div className="auth-modal-actions"><a href={loginUrl} className="auth-modal-login-btn"><img src="/hackclub-flag.svg" alt="" className="auth-modal-btn-flag"/><span>Sign in with Hack Club</span></a></div>
      <div className="auth-modal-footer">Powered by <a href="https://hackclub.com" target="_blank" rel="noopener noreferrer">Hack Club</a></div>
    </div>
  </div>;
}

function OpportunityFinder({ user }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sourceNotice, setSourceNotice] = useState('');
  const [sourceCheckedAt, setSourceCheckedAt] = useState(null);
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
      setSourceNotice(data.sourceNotice || '');
      setSourceCheckedAt(data.sourceCheckedAt || null);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query, type]);

  useEffect(() => { if (user) search('', 'all'); }, [user]);

  if (!user) return <section className="opportunity-finder" aria-labelledby="opportunity-title">
    <div className="opportunity-heading"><div><span className="opportunity-eyebrow">HACK CLUB SIGN-IN REQUIRED</span><h1 id="opportunity-title">Verify to view opportunities</h1>
      <p>Sign in with your Hack Club account to view Slack opportunities. If you need help with verification, ask freely in Hack Club Slack’s #help channel.</p>
      <a className="opportunity-search-button" href="/auth/login">Sign in with Hack Club</a></div></div>
  </section>;

  const filters = [['all', 'All'], ['roles', 'Roles'], ['programs', 'Programs & YSWS'], ['events', 'Events']];
  return <section className="opportunity-finder" aria-labelledby="opportunity-title">
    <div className="opportunity-heading">
      <div><span className="opportunity-eyebrow">HACK CLUB SLACK · LAST 7 DAYS</span><h1 id="opportunity-title">Find your next opportunity</h1>
        <p>Search the latest week of collected Slack posts for programs, events, roles, bounties, and calls for help. Every result links to its original post.</p></div>
    </div>
    <form className="opportunity-search" onSubmit={event => { event.preventDefault(); search(); }}>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Try: remote reviewer, hardware, game YSWS…" aria-label="Search Hack Club opportunities" />
      <button className="opportunity-search-button" type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
    </form>
    <div className="opportunity-filters" role="group" aria-label="Opportunity type">
      {filters.map(([id, label]) => <button key={id} type="button" className={type === id ? 'selected' : ''} onClick={() => { setType(id); search(query, id); }}>{label}</button>)}
    </div>
    <div className="opportunity-results-heading"><h2>{searched ? `${items.length} posts from the last 7 days` : 'Recent posts from the last 7 days'}</h2><span>Confirm availability in the original post.</span></div>
    {error && <div className="opportunity-state">{error}</div>}
    {!error && sourceNotice && <div className="opportunity-state">{sourceNotice}</div>}
    {!error && !sourceNotice && sourceCheckedAt && <div className="opportunity-freshness">Slack last checked {new Date(sourceCheckedAt).toLocaleString()}.</div>}
    {!error && !sourceNotice && !loading && items.length === 0 && <div className="opportunity-state">No matching opportunity posts were found in the collected Slack posts from the last 7 days. Try another search, or check back after the next sync.</div>}
    <div className="opportunity-grid">{items.map(item => <article className="opportunity-card" key={item.id || item.url}>
      <div className="opportunity-card-meta"><span>#{item.channel}</span><span>{item.publishedDate || 'Date unavailable'}</span></div>
      <h3>{item.title}</h3>
      <p>{String(item.summary || 'Open the source post for details.').slice(0, 380)}{String(item.summary || '').length > 380 ? '…' : ''}</p>
      <div className={`opportunity-status ${item.status === 'Past event' || item.status === 'Deadline passed' ? 'stale' : ''}`}>{item.status}</div>
      <div className="opportunity-card-actions">{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">Open source <span aria-hidden="true">↗</span></a> : <span>Source link unavailable</span>}{item.eventDate && <span>Event: {item.eventDate}</span>}</div>
    </article>)}</div>
    {loading && <div className="opportunity-state">Searching the latest indexed posts…</div>}
    <p className="opportunity-freshness">This view searches Hacki’s collected Slack snapshot from the last 7 days. Check deadlines and eligibility at the linked source.</p>
  </section>;
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('hacki-theme') || 'system'; } catch { return 'system'; }
  });
  const [preferences, setPreferences] = useState(() => {
    const defaults = { enterToSend: true, showStarterPrompts: true, notifyWhenDone: false, responseStyle: 'default', responseLanguage: 'auto', customInstructions: '' };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('hacki-preferences') || '{}') }; }
    catch { return defaults; }
  });
  const [preferencesLoadedFor, setPreferencesLoadedFor] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [chats, setChats] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingChatId, setPendingChatId] = useState(null);
  const [activityStatus, setActivityStatus] = useState('');
  const [streamedText, setStreamedText] = useState('');
  const [opportunitiesOpen, setOpportunitiesOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 768);
  const textareaRef = useRef(null);
  const conversationRef = useRef(null);

  const activeChat = useMemo(() => chats.find(chat => chat.id === activeId) || chats[0] || null, [chats, activeId]);
  const savedChats = useMemo(() => chats.filter(chat => chat.messages?.some(message => message.role === 'user')), [chats]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('hacki-theme', theme); } catch {}
  }, [theme]);

  useEffect(() => {
    try { localStorage.setItem('hacki-preferences', JSON.stringify(preferences)); } catch {}
  }, [preferences]);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setPreferencesLoadedFor(null); return () => { cancelled = true; }; }
    fetch('/api/settings', { credentials: 'include', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (cancelled) return;
        const saved = data?.settings?.hacki_preferences;
        if (saved) {
          try { setPreferences(current => ({ ...current, ...JSON.parse(saved) })); } catch {}
        }
        setPreferencesLoadedFor(user.id);
      })
      .catch(() => { if (!cancelled) setPreferencesLoadedFor(user.id); });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user || preferencesLoadedFor !== user.id) return;
    const timer = window.setTimeout(() => {
      fetch('/api/settings/hacki_preferences', {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(preferences) })
      }).catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [preferences, preferencesLoadedFor, user?.id]);

  useEffect(() => {
    const onShortcut = event => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault();
        setSettingsOpen(true);
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  function updatePreference(key, value) {
    setPreferences(current => ({ ...current, [key]: value }));
  }

  async function updateNotificationPreference(enabled) {
    if (enabled && !('Notification' in window)) {
      window.alert('This browser does not support desktop notifications.');
      return;
    }
    if (enabled && Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') return;
    updatePreference('notifyWhenDone', enabled);
  }

  function exportConversations() {
    const contents = JSON.stringify({ exportedAt: new Date().toISOString(), account: user?.email || user?.name || null, conversations: savedChats }, null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hacki-conversations-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function clearAllConversations() {
    if (!savedChats.length || !window.confirm(`Delete all ${savedChats.length} saved conversations? This cannot be undone.`)) return;
    const keys = savedChats.map(chat => chat.id);
    const results = await Promise.all(keys.map(key => fetch(`/api/chat/sessions/${encodeURIComponent(key)}`, { method: 'DELETE', credentials: 'include' })));
    if (results.some(response => !response.ok && response.status !== 404)) {
      window.alert('Some conversations could not be deleted. Please try again.');
      return;
    }
    const replacement = newChat();
    setChats([replacement]);
    setActiveId(replacement.id);
    try { localStorage.removeItem(`hacki_chats_${user?.id || user?.email || 'user'}`); } catch {}
    setSettingsOpen(false);
  }

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
        for (const chat of local) {
          if (chat?.id && chat.messages?.some(message => message.role === 'user') && !keys.has(chat.id)) await importChat(chat);
        }
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
  }, [activeChat?.messages?.length, pendingChatId, activityStatus, streamedText]);

  const updateChat = useCallback((chatId, updater) => {
    setChats(current => current.map(chat => chat.id === chatId ? updater(chat) : chat));
  }, []);

  function createNewChat() {
    setOpportunitiesOpen(false);
    setAdminOpen(false);
    if (activeChat && activeChat.messages.length === 0) {
      setActiveId(activeChat.id);
      return;
    }
    const chat = newChat();
    setChats(current => [chat, ...current]);
    setActiveId(chat.id);
    if (window.innerWidth <= 768) setSidebarOpen(false);
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
    setActivityStatus('Reading your question…');
    setStreamedText('');

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
      let data;
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        await readEventStream(response, (event, payload) => {
          if (event === 'status') setActivityStatus(payload.message || 'Working…');
          else if (event === 'delta') setStreamedText(current => current + String(payload.text || ''));
          else if (event === 'error') throw new Error(payload.error || 'Hacki could not finish this answer.');
          else if (event === 'done') data = payload;
        });
        if (!data) throw new Error('The connection ended before Hacki finished its answer. Please try again.');
      } else {
        const responseText = await response.text();
        try { data = JSON.parse(responseText); } catch {
          const detail = responseText.replace(/\s+/g, ' ').trim().slice(0, 180);
          throw new Error(response.ok ? 'The server returned an unreadable response.' : `Server error (${response.status})${detail ? `: ${detail}` : '.'}`);
        }
      }
      if (!response.ok) throw new Error(data.error || `Server error (${response.status}).`);
      if (!response.ok || !data.ok) throw new Error(data.error || 'Something went wrong.');
      updateChat(chatId, chat => ({ ...chat, title, messages: [...chat.messages, { id: `${Date.now()}-assistant`, dbId: data.answerMessageId, role: 'assistant', text: data.answer, sources: data.sources || [], suggestions: data.suggestedQueries || [], animate: true }] }));
    } catch (error) {
      updateChat(chatId, chat => ({ ...chat, messages: [...chat.messages, { id: `${Date.now()}-error`, role: 'assistant', text: `⚠️ ${error.message}` }] }));
    } finally {
      if (preferences.notifyWhenDone && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Hacki replied', { body: 'Your answer is ready.' }); } catch {}
      }
      setSending(false);
      setPendingChatId(null);
      setActivityStatus('');
      setStreamedText('');
      textareaRef.current?.focus();
    }
  }

  function handleTextareaChange(event) {
    setDraft(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && ((preferences.enterToSend && !event.shiftKey) || (!preferences.enterToSend && (event.ctrlKey || event.metaKey)))) {
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
          <button className={`new-chat-btn opportunity-nav-btn ${opportunitiesOpen ? 'selected' : ''}`} onClick={() => { setAdminOpen(false); setOpportunitiesOpen(true); if (window.innerWidth <= 768) setSidebarOpen(false); }}><Icon name="search" size={18}/><span>Find opportunities</span></button>
          {user?.slackId === 'U093BDEP8FJ' && <button className={`new-chat-btn opportunity-nav-btn ${adminOpen ? 'selected' : ''}`} onClick={() => { setOpportunitiesOpen(false); setAdminOpen(true); if (window.innerWidth <= 768) setSidebarOpen(false); }}><Icon name="shield" size={18}/><span>Admin</span></button>}
        </div>
        <div className="sidebar-chats">
          {savedChats.length === 0 ? <div className="chat-history-empty-notice">{!authReady ? 'Loading…' : user ? 'Your conversations will appear here' : 'Sign in to see your conversations'}</div> : savedChats.map(chat => <div key={chat.id} className={`chat-history-item ${chat.id === activeChat?.id ? 'active' : ''}`} onClick={() => { setActiveId(chat.id); if (window.innerWidth <= 768) setSidebarOpen(false); }}>
            <span className="chat-history-title">{chat.title || 'New chat'}</span><button className="chat-history-delete" title="Delete chat" aria-label={`Delete ${chat.title || 'chat'}`} onClick={event => removeChat(chat.id, event)}><Icon name="trash" size={14}/></button>
          </div>)}
        </div>
        <div className="sidebar-bottom">
          {!user ? <div className="auth-section"><a href="/auth/login" className="hc-auth-btn"><img src="/hackclub-flag.svg" alt="" className="auth-btn-icon"/><span>Sign in with Hack Club</span></a><button className="sidebar-nav-item sidebar-settings-link" onClick={() => setSettingsOpen(true)}><Icon name="settings" size={17}/>Settings</button></div> : <div className="sidebar-account-area">
            {profileMenuOpen && <div className="account-menu"><button onClick={() => { setSettingsOpen(true); setProfileMenuOpen(false); }}><Icon name="settings" size={16}/>Settings</button><a href="/auth/logout" onClick={logout}><span aria-hidden="true">↪</span>Sign out</a></div>}
            <button className="user-profile-card" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen(open => !open)}>
              <span className="user-avatar">{user.avatar ? <img src={user.avatar} alt=""/> : profileInitials}</span>
              <span className="user-details"><span className="user-name">{user.name || 'Hack Clubber'}</span><span className="user-sub">{user.email || 'Hack Club Member'}</span>{user.slackId && <span className="user-slack-tag"><span className="slack-dot"/><span>Slack linked</span></span>}</span>
              <span className="account-menu-chevron" aria-hidden="true">⌃</span>
            </button>
          </div>}
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button" title="Open sidebar" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><Icon name="menu"/></button><div className="model-badge"><img src="/hacki-logo.png" alt="" className="model-logo"/><span className="model-title">Hacki</span><span className="model-version">HACK CLUB HELPER</span></div></div>
          <div className="topbar-right">
            <div className="theme-control" role="group" aria-label="Choose appearance">{themeOptions.map(option => <button key={option.id} type="button" className="theme-icon-btn" data-theme-choice={option.id} aria-label={option.label} title={option.label} aria-pressed={theme === option.id} onClick={() => setTheme(option.id)}><svg viewBox="0 0 24 24" aria-hidden="true">{option.icon}</svg></button>)}</div>
            {!user && authReady && <a href="/auth/login" className="topbar-login-btn">Sign in</a>}
            <button className="icon-button" title="New chat" aria-label="New chat" onClick={createNewChat}><Icon name="edit" size={18}/></button>
          </div>
        </header>

        {adminOpen ? <div className="conversation-container opportunity-container"><AdminDashboard/></div> : opportunitiesOpen ? <div className="conversation-container opportunity-container"><OpportunityFinder user={user}/></div> : <div className="conversation-container" ref={conversationRef}>
          {onFreshChat && <div className="empty-state">
            <div className="empty-kicker"><span className="empty-kicker-dot"/> A LITTLE HELP FOR YOUR NEXT BIG BUILD</div>
            <div className="empty-hero-row"><div className="empty-logo-wrap"><img src="/hacki-logo.png" alt="Hacki" className="empty-hacki-logo"/></div><span className="empty-doodle" aria-hidden="true">✳</span></div>
            <h2 className="empty-title">Make something<br className="desktop-break"/> cool.</h2><p className="empty-desc">Questions about Hack Club? Stuck on a project? Pull up a chair — let’s figure it out.</p>
            {preferences.showStarterPrompts && <><div className="prompt-section-label">A FEW PLACES TO START</div>
            <div className="empty-prompts-grid">{STARTER_PROMPTS.map(([icon, label, query]) => <button key={label} className="empty-prompt-card" onClick={() => handleSend(query)}><span className="prompt-icon"><img src={icon} alt="" /></span><span className="prompt-text">{label}</span></button>)}</div></>}
          </div>}
          {activeChat?.messages?.length > 0 && <div className="messages-list">{activeChat.messages.map((message, index) => <Message key={message.id || `${activeChat.id}-${index}`} message={message}/>)}{pendingChatId === activeChat.id && <TypingIndicator status={activityStatus} text={streamedText}/>}</div>}
        </div>}

        {!opportunitiesOpen && !adminOpen && <div className="input-container"><div className="input-box">
          <textarea id="chat-input" ref={textareaRef} rows={1} placeholder={user ? 'Message Hacki…' : 'Verify your Hack Club account to chat'} disabled={!user || sending} value={draft} onChange={handleTextareaChange} onKeyDown={handleKeyDown} aria-label="Message Hacki" />
          <button className="send-btn" onClick={() => handleSend()} disabled={!user || sending || !draft.trim()} title="Send message" aria-label="Send message"><Icon name="send" size={18}/></button>
        </div><div className="disclaimer">Hacki can make mistakes. Check verified Hack Club sources on Slack &amp; <a href="https://hackclub.com" target="_blank" rel="noopener noreferrer">hackclub.com</a>.</div></div>}
      </main>
    </div>
    {settingsOpen && <SettingsModal theme={theme} setTheme={setTheme} preferences={preferences} onPreferenceChange={updatePreference} onNotificationChange={updateNotificationPreference} onClose={() => setSettingsOpen(false)} onExport={exportConversations} onClear={clearAllConversations} user={user} chatCount={savedChats.length}/>}
    {authReady && !user && <AuthModal/>}
  </>;
}
