document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const sidebar = document.getElementById('sidebar');
  const sidebarOpenBtn = document.getElementById('sidebar-open-btn');
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  const newChatBtn = document.getElementById('new-chat-btn');
  const newChatTopBtn = document.getElementById('new-chat-top-btn');
  const chatHistoryList = document.getElementById('chat-history-list');

  const conversationContainer = document.getElementById('conversation-container');
  const emptyState = document.getElementById('empty-state');
  const messagesList = document.getElementById('messages-list');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const quickToolsBtn = document.getElementById('quick-tools-btn');

  // Modals
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalContent = document.getElementById('modal-content');
  const modalSearchInput = document.getElementById('modal-search-input');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  const sidebarTeamBtn = document.getElementById('sidebar-team-btn');
  const sidebarYswsBtn = document.getElementById('sidebar-ysws-btn');
  const sidebarOppsBtn = document.getElementById('sidebar-opps-btn');

  // State
  let chats = [];
  let currentChatId = null;
  let isSending = false;
  let currentModalType = null;

  // Initialize marked
  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });
  }

  // Load chats from localStorage
  function loadStoredChats() {
    try {
      chats = JSON.parse(localStorage.getItem('hacki_chats')) || [];
    } catch {
      chats = [];
    }

    if (chats.length === 0) {
      createNewChat();
    } else {
      currentChatId = chats[0].id;
      renderChatHistorySidebar();
      renderCurrentChat();
    }
  }

  function saveStoredChats() {
    try {
      localStorage.setItem('hacki_chats', JSON.stringify(chats));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }
    renderChatHistorySidebar();
  }

  function createNewChat() {
    const newChat = {
      id: 'chat_' + Date.now(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now()
    };
    chats.unshift(newChat);
    currentChatId = newChat.id;
    saveStoredChats();
    renderCurrentChat();
    chatInput.focus();
  }

  function getCurrentChat() {
    return chats.find(c => c.id === currentChatId) || chats[0];
  }

  function deleteChat(chatId, e) {
    if (e) e.stopPropagation();
    chats = chats.filter(c => c.id !== chatId);
    if (chats.length === 0) {
      createNewChat();
    } else {
      if (currentChatId === chatId) {
        currentChatId = chats[0].id;
      }
      saveStoredChats();
      renderCurrentChat();
    }
  }

  function renderChatHistorySidebar() {
    chatHistoryList.innerHTML = '';
    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = `chat-history-item ${chat.id === currentChatId ? 'active' : ''}`;
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'chat-history-title';
      titleSpan.textContent = chat.title || 'New chat';
      item.appendChild(titleSpan);

      const delBtn = document.createElement('button');
      delBtn.className = 'chat-history-delete';
      delBtn.title = 'Delete chat';
      delBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      `;
      delBtn.addEventListener('click', (e) => deleteChat(chat.id, e));
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        currentChatId = chat.id;
        renderChatHistorySidebar();
        renderCurrentChat();
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('mobile-open');
        }
      });

      chatHistoryList.appendChild(item);
    });
  }

  function renderCurrentChat() {
    const chat = getCurrentChat();
    messagesList.innerHTML = '';

    if (!chat || chat.messages.length === 0) {
      emptyState.style.display = 'flex';
      messagesList.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      messagesList.style.display = 'flex';

      chat.messages.forEach(msg => {
        appendMessageDOM(msg.role, msg.text, msg.sources, msg.suggestions);
      });
      scrollToBottom();
    }
  }

  // Messaging
  async function handleSend(text) {
    const message = (text || chatInput.value).trim();
    if (!message || isSending) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;
    isSending = true;

    const chat = getCurrentChat();

    // If first message in chat, set chat title
    if (chat.messages.length === 0) {
      chat.title = message.slice(0, 30) + (message.length > 30 ? '...' : '');
      saveStoredChats();
    }

    // Hide empty state and show messages
    emptyState.style.display = 'none';
    messagesList.style.display = 'flex';

    // Append User Message
    chat.messages.push({ role: 'user', text: message });
    appendMessageDOM('user', message);
    saveStoredChats();

    // Typing indicator
    const typingEl = showTypingIndicator();

    try {
      const historyPayload = chat.messages.slice(-8).map(m => ({
        role: m.role,
        content: m.text
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: historyPayload
        })
      });

      const data = await res.json();
      removeTypingIndicator(typingEl);

      if (data.ok) {
        chat.messages.push({
          role: 'assistant',
          text: data.answer,
          sources: data.sources || [],
          suggestions: data.suggestedQueries || []
        });
        saveStoredChats();
        appendMessageDOM('assistant', data.answer, data.sources, data.suggestedQueries);
      } else {
        const errorText = `⚠️ ${data.error || 'Something went wrong.'}`;
        chat.messages.push({ role: 'assistant', text: errorText });
        appendMessageDOM('assistant', errorText);
      }
    } catch (err) {
      removeTypingIndicator(typingEl);
      const errorText = `⚠️ Connection error: ${err.message}`;
      appendMessageDOM('assistant', errorText);
    } finally {
      isSending = false;
      sendBtn.disabled = !chatInput.value.trim();
      chatInput.focus();
    }
  }

  function appendMessageDOM(role, text, sources = [], suggestions = []) {
    const item = document.createElement('div');
    item.className = `message-item ${role}`;

    if (role === 'assistant') {
      const avatarImg = document.createElement('img');
      avatarImg.className = 'assistant-avatar';
      avatarImg.src = 'https://assets.hackclub.com/icon-rounded.svg';
      avatarImg.alt = 'Hack Club';
      item.appendChild(avatarImg);
    }

    const body = document.createElement('div');
    body.className = 'message-body';

    if (role === 'assistant' && window.marked) {
      body.innerHTML = marked.parse(text);
    } else {
      body.textContent = text;
    }

    // Sources row
    if (role === 'assistant' && sources && sources.length > 0) {
      const srcRow = document.createElement('div');
      srcRow.className = 'msg-sources-row';

      sources.forEach(s => {
        const tag = document.createElement('a');
        tag.className = 'msg-source-tag';
        tag.href = s.url;
        tag.target = '_blank';
        tag.rel = 'noopener noreferrer';
        tag.innerHTML = `<span>🔗</span> ${s.title}`;
        srcRow.appendChild(tag);
      });

      body.appendChild(srcRow);
    }

    // Action buttons (Copy)
    if (role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.title = 'Copy response';
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>Copy</span>
      `;
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(text);
          copyBtn.classList.add('copied');
          copyBtn.querySelector('span').textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.querySelector('span').textContent = 'Copy';
          }, 2000);
        } catch {}
      });

      actions.appendChild(copyBtn);
      body.appendChild(actions);
    }

    // Follow-up Suggestions
    if (role === 'assistant' && suggestions && suggestions.length > 0) {
      const suggRow = document.createElement('div');
      suggRow.className = 'msg-suggestions-row';

      suggestions.forEach(s => {
        const chip = document.createElement('button');
        chip.className = 'msg-suggestion-chip';
        chip.textContent = s;
        chip.addEventListener('click', () => handleSend(s));
        suggRow.appendChild(chip);
      });

      body.appendChild(suggRow);
    }

    item.appendChild(body);
    messagesList.appendChild(item);
    scrollToBottom();
  }

  function showTypingIndicator() {
    const item = document.createElement('div');
    item.className = 'message-item assistant';

    const avatarImg = document.createElement('img');
    avatarImg.className = 'assistant-avatar';
    avatarImg.src = 'https://assets.hackclub.com/icon-rounded.svg';
    item.appendChild(avatarImg);

    const body = document.createElement('div');
    body.className = 'message-body';
    body.innerHTML = `
      <div class="typing-dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    `;

    item.appendChild(body);
    messagesList.appendChild(item);
    scrollToBottom();
    return item;
  }

  function removeTypingIndicator(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function scrollToBottom() {
    conversationContainer.scrollTop = conversationContainer.scrollHeight;
  }

  // Input event listeners
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 160)}px`;
    sendBtn.disabled = !chatInput.value.trim();
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  sendBtn.addEventListener('click', () => handleSend());

  // Prompt Cards in Empty State
  document.querySelectorAll('.prompt-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) handleSend(prompt);
    });
  });

  // Sidebar toggle
  sidebarOpenBtn.addEventListener('click', () => {
    sidebar.classList.remove('closed');
    if (window.innerWidth <= 768) {
      sidebar.classList.add('mobile-open');
    }
  });

  sidebarCloseBtn.addEventListener('click', () => {
    sidebar.classList.add('closed');
    sidebar.classList.remove('mobile-open');
  });

  newChatBtn.addEventListener('click', createNewChat);
  newChatTopBtn.addEventListener('click', createNewChat);

  // Quick Tools / Directory button next to textarea
  quickToolsBtn.addEventListener('click', () => {
    openModal('👥 Hack Club Team Directory', 'team');
  });

  // Modals for Team, YSWS, Opps
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
      modalContent.innerHTML = `<div style="color:#ff8c9c; padding:20px;">Failed to load: ${err.message}</div>`;
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
            <button class="item-link-btn ask-modal-btn" data-query="Tell me about ${m.name} and their role at Hack Club">❓ Ask Hacki</button>
          </div>
        </div>
      </div>
    `).join('');

    modalContent.querySelectorAll('.ask-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-query');
        closeModal();
        handleSend(q);
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
            <span class="item-badge" style="background:${p.isActive ? 'rgba(51,214,166,0.18)' : 'rgba(255,255,255,0.08)'}; color:${p.isActive ? '#33d6a6' : 'var(--text-muted)'}">
              ${p.status.toUpperCase()}
            </span>
            ${p.isNew ? '<span class="item-badge" style="background:var(--primary-hc); color:#fff">NEW</span>' : ''}
          </div>
          <div class="item-bio">${p.description}</div>
          ${p.deadline ? `<div style="font-size:12px; color:#ff8c37; margin-top:6px;">⏰ Deadline: ${p.deadline}</div>` : ''}
          <div class="item-links">
            ${p.website ? `<a class="item-link-btn" href="${p.website}" target="_blank">🌐 Website</a>` : ''}
            ${p.slackChannel ? `<span class="item-link-btn" style="color:#58a6ff">💬 ${p.slackChannel}</span>` : ''}
            <button class="item-link-btn ask-modal-btn" data-query="What is ${p.name} YSWS and how do I participate?">❓ Ask Hacki</button>
          </div>
        </div>
      </div>
    `).join('');

    modalContent.querySelectorAll('.ask-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-query');
        closeModal();
        handleSend(q);
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
            ${o.isHiring ? '<span class="item-badge" style="background:var(--primary-hc); color:#fff">ROLE CALL</span>' : ''}
          </div>
          <div class="item-bio" style="white-space:pre-wrap;">${(o.cleanText || o.summary || '').slice(0, 300)}...</div>
          <div class="item-links">
            ${o.url ? `<a class="item-link-btn" href="${o.url}" target="_blank">💬 Open in Slack</a>` : ''}
            <button class="item-link-btn ask-modal-btn" data-query="Tell me about the opportunities or reviewer roles posted in #${o.channel}">❓ Ask Hacki</button>
          </div>
        </div>
      </div>
    `).join('');

    modalContent.querySelectorAll('.ask-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-query');
        closeModal();
        handleSend(q);
      });
    });
  }

  sidebarTeamBtn.addEventListener('click', () => openModal('👥 Hack Club Team Directory', 'team'));
  sidebarYswsBtn.addEventListener('click', () => openModal('🚀 Hack Club YSWS Programs', 'ysws'));
  sidebarOppsBtn.addEventListener('click', () => openModal('📢 Slack Opportunities & Reviewer Calls', 'opps'));

  // Init
  loadStoredChats();
});
