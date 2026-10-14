document.addEventListener('DOMContentLoaded', () => {
  const chatMessages = document.getElementById('chat-messages');
  const userInput = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const teamCountEl = document.getElementById('team-count');
  const yswsCountEl = document.getElementById('ysws-count');

  // Modal elements
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalContent = document.getElementById('modal-content');
  const modalSearchInput = document.getElementById('modal-search-input');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  const openTeamBtn = document.getElementById('open-team-btn');
  const openYswsBtn = document.getElementById('open-ysws-btn');
  const openOppsBtn = document.getElementById('open-opps-btn');
  const syncDataBtn = document.getElementById('sync-data-btn');

  let conversationHistory = [];
  let isSending = false;
  let currentModalType = null;

  // Initialize marked configuration
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  // 1. Fetch system status
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.ok && data.counts) {
        if (teamCountEl) teamCountEl.textContent = data.counts.teamMembers || '145';
        if (yswsCountEl) yswsCountEl.textContent = data.counts.activeYSWS || '26';
      }
    } catch (e) {
      console.warn('Could not fetch status:', e);
    }
  }
  fetchStatus();

  // 2. Chat messaging logic
  async function sendMessage(text) {
    const message = (text || userInput.value).trim();
    if (!message || isSending) return;

    // Reset input
    userInput.value = '';
    userInput.style.height = 'auto';

    // Append user message
    appendMessage('user', message);
    conversationHistory.push({ role: 'user', content: message });

    // Show typing indicator
    const typingIndicator = showTypingIndicator();
    isSending = true;
    sendBtn.disabled = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: conversationHistory
        })
      });

      const data = await response.json();
      removeTypingIndicator(typingIndicator);

      if (data.ok) {
        appendMessage('assistant', data.answer, data.sources, data.suggestedQueries);
        conversationHistory.push({ role: 'assistant', content: data.answer });
      } else {
        appendMessage('assistant', `⚠️ ${data.error || 'Something went wrong.'}`);
      }
    } catch (err) {
      removeTypingIndicator(typingIndicator);
      appendMessage('assistant', `⚠️ Network error: ${err.message}`);
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      userInput.focus();
    }
  }

  function appendMessage(role, text, sources = [], suggestions = []) {
    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '🧑' : '🦖';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Render markdown or fallback to text
    if (window.marked && role === 'assistant') {
      bubble.innerHTML = marked.parse(text);
    } else {
      bubble.textContent = text;
    }

    // Sources bar if assistant message
    if (role === 'assistant' && sources && sources.length > 0) {
      const sourcesBar = document.createElement('div');
      sourcesBar.className = 'sources-bar';
      
      const label = document.createElement('span');
      label.className = 'source-label';
      label.textContent = 'Verified Sources:';
      sourcesBar.appendChild(label);

      sources.forEach(src => {
        const link = document.createElement('a');
        link.className = 'source-pill';
        link.href = src.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.innerHTML = `<span>🔗</span> ${src.title}`;
        sourcesBar.appendChild(link);
      });

      bubble.appendChild(sourcesBar);
    }

    // Follow-up suggestion chips
    if (role === 'assistant' && suggestions && suggestions.length > 0) {
      const suggBar = document.createElement('div');
      suggBar.className = 'suggestions-bar';

      suggestions.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'suggestion-chip';
        btn.textContent = s;
        btn.addEventListener('click', () => sendMessage(s));
        suggBar.appendChild(btn);
      });

      bubble.appendChild(suggBar);
    }

    if (role === 'user') {
      row.appendChild(bubble);
      row.appendChild(avatar);
    } else {
      row.appendChild(avatar);
      row.appendChild(bubble);
    }

    chatMessages.appendChild(row);
    scrollToBottom();
  }

  function showTypingIndicator() {
    const row = document.createElement('div');
    row.className = 'message-row assistant typing-row';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '🦖';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble typing-indicator';
    bubble.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
    scrollToBottom();
    return row;
  }

  function removeTypingIndicator(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Event Listeners for Chat
  sendBtn.addEventListener('click', () => sendMessage());

  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = `${Math.min(userInput.scrollHeight, 140)}px`;
  });

  // Prompt chips in welcome hero
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) sendMessage(prompt);
    });
  });

  // 3. Modal / Directory Viewers
  function openModal(title, type) {
    currentModalType = type;
    modalTitle.textContent = title;
    modalSearchInput.value = '';
    modalBackdrop.classList.add('active');
    loadModalData(type, '');
  }

  function closeModal() {
    modalBackdrop.classList.remove('active');
    currentModalType = null;
  }

  modalCloseBtn.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  modalSearchInput.addEventListener('input', (e) => {
    if (currentModalType) {
      loadModalData(currentModalType, e.target.value.trim());
    }
  });

  async function loadModalData(type, query = '') {
    modalContent.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">Loading...</div>';

    try {
      if (type === 'team') {
        const res = await fetch(`/api/team?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderTeamModal(data.members || []);
      } else if (type === 'ysws') {
        const res = await fetch(`/api/ysws?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderYSWSModal(data.programs || []);
      } else if (type === 'opps') {
        const res = await fetch('/api/opportunities');
        const data = await res.json();
        renderOppsModal(data.opportunities || [], query);
      }
    } catch (err) {
      modalContent.innerHTML = `<div style="color:#ff8c9c; padding:20px;">Failed to load data: ${err.message}</div>`;
    }
  }

  function renderTeamModal(members) {
    if (members.length === 0) {
      modalContent.innerHTML = '<div style="color:var(--text-muted); padding:20px;">No team members found.</div>';
      return;
    }

    modalContent.innerHTML = members.map(m => `
      <div class="item-card">
        <img class="item-avatar" src="${m.avatar || 'https://assets.hackclub.com/icon-rounded.svg'}" alt="${m.name}" onerror="this.src='https://assets.hackclub.com/icon-rounded.svg'">
        <div class="item-info">
          <div class="item-title">
            ${m.name}
            ${m.staff ? '<span class="item-badge">Staff</span>' : ''}
          </div>
          <div class="item-sub">${m.role} &bull; ${m.department}</div>
          ${m.bio ? `<div class="item-bio">${m.bio}</div>` : ''}
          <div class="item-links">
            ${m.email ? `<a class="item-link-btn" href="mailto:${m.email}">✉️ ${m.email}</a>` : ''}
            ${m.slackUrl ? `<a class="item-link-btn" href="${m.slackUrl}" target="_blank">💬 Slack Profile</a>` : ''}
            ${m.website ? `<a class="item-link-btn" href="${m.website}" target="_blank">🌐 Website</a>` : ''}
            <button class="item-link-btn ask-about-btn" data-name="${m.name}">❓ Ask Hacki</button>
          </div>
        </div>
      </div>
    `).join('');

    modalContent.querySelectorAll('.ask-about-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        closeModal();
        sendMessage(`Tell me about ${name} and their role at Hack Club`);
      });
    });
  }

  function renderYSWSModal(programs) {
    if (programs.length === 0) {
      modalContent.innerHTML = '<div style="color:var(--text-muted); padding:20px;">No YSWS programs found.</div>';
      return;
    }

    modalContent.innerHTML = programs.map(p => `
      <div class="item-card">
        <div class="item-info">
          <div class="item-title">
            ${p.name}
            <span class="item-badge" style="background:${p.isActive ? 'rgba(51,214,166,0.15)' : 'rgba(255,255,255,0.08)'}; color:${p.isActive ? 'var(--accent-cyan)' : 'var(--text-muted)'}">
              ${p.status.toUpperCase()}
            </span>
            ${p.isNew ? '<span class="item-badge" style="background:var(--primary); color:#fff">NEW</span>' : ''}
          </div>
          <div class="item-bio">${p.description}</div>
          ${p.deadline ? `<div style="font-size:12px; color:var(--accent-orange); margin-top:6px;">⏰ Deadline: ${p.deadline}</div>` : ''}
          <div class="item-links">
            ${p.website ? `<a class="item-link-btn" href="${p.website}" target="_blank">🌐 Website</a>` : ''}
            ${p.slackChannel ? `<span class="item-link-btn" style="color:var(--accent-cyan)">💬 ${p.slackChannel}</span>` : ''}
            <button class="item-link-btn ask-ysws-btn" data-name="${p.name}">❓ Ask Hacki</button>
          </div>
        </div>
      </div>
    `).join('');

    modalContent.querySelectorAll('.ask-ysws-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name');
        closeModal();
        sendMessage(`What is ${name} YSWS and how do I participate?`);
      });
    });
  }

  function renderOppsModal(opps, query = '') {
    const filtered = query
      ? opps.filter(o => `${o.title} ${o.summary} ${o.channel}`.toLowerCase().includes(query.toLowerCase()))
      : opps;

    if (filtered.length === 0) {
      modalContent.innerHTML = '<div style="color:var(--text-muted); padding:20px;">No reviewer or fulfiller calls found matching query.</div>';
      return;
    }

    modalContent.innerHTML = filtered.map(o => `
      <div class="item-card">
        <div class="item-info">
          <div class="item-title">
            ${o.title}
            <span class="item-badge">#${o.channel}</span>
            ${o.isHiring ? '<span class="item-badge" style="background:var(--primary); color:#fff">ROLE CALL</span>' : ''}
          </div>
          <div class="item-bio" style="white-space:pre-wrap;">${(o.cleanText || o.summary || '').slice(0, 300)}...</div>
          <div class="item-links">
            ${o.url ? `<a class="item-link-btn" href="${o.url}" target="_blank">💬 Open in Slack</a>` : ''}
            <button class="item-link-btn ask-opp-btn" data-channel="${o.channel}">❓ Ask Hacki Details</button>
          </div>
        </div>
      </div>
    `).join('');

    modalContent.querySelectorAll('.ask-opp-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ch = btn.getAttribute('data-channel');
        closeModal();
        sendMessage(`What opportunities or reviewer roles were posted in #${ch}?`);
      });
    });
  }

  // Header Nav buttons
  openTeamBtn.addEventListener('click', () => openModal('👥 Hack Club Team Directory', 'team'));
  openYswsBtn.addEventListener('click', () => openModal('🚀 Hack Club YSWS Programs', 'ysws'));
  openOppsBtn.addEventListener('click', () => openModal('📢 Slack Opportunities & Reviewer Calls', 'opps'));

  syncDataBtn.addEventListener('click', async () => {
    syncDataBtn.textContent = '⏳';
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Sync triggered!');
      setTimeout(fetchStatus, 3000);
    } catch (e) {
      alert('Sync failed: ' + e.message);
    } finally {
      syncDataBtn.textContent = '🔄';
    }
  });
});
