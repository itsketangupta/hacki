import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { askHacki } from '../ai/hackiAgent.js';
import { loadTeam, searchTeam, fetchTeam } from '../scrapers/teamScraper.js';
import { loadYSWS, searchYSWS, getNewYSWS, getActiveYSWS, fetchYSWS } from '../scrapers/yswsScraper.js';
import { loadAnnouncements, getHiringOpportunities, getRecentAnnouncements, searchAnnouncements } from '../slack/announcementsCollector.js';
import { getSessionUser } from '../auth/hackclubAuth.js';
import { autoAddUserToHackiChannel } from '../slack/slackChannelManager.js';
import { config } from '../config.js';
import { sendEmail, isEmailConfigured } from '../integrations/email.js';
import {
  getOrCreateChatSession,
  getChatSessionByKey,
  getChatSessionsByUser,
  updateChatSessionTitle,
  renameChatSession,
  deleteChatSession,
  appendMessage,
  getMessages,
  getHistoryForAI,
  deleteMessages,
  getSetting,
  setSetting,
  getAllSettings,
  deleteSetting,
  setAnswerFeedback,
  userOwnsAssistantMessage,
  getRecentSlackMentions,
  getEmailMarketingOptIn,
  setEmailMarketingOptIn,
  getEmailMarketingRecipients
} from '../db/database.js';

export const apiRouter = express.Router();

// API responses include account and chat data; never let browsers or proxies
// reuse a response after the session that authorized it has been revoked.
apiRouter.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

async function getDataSnapshotDates() {
  const dates = { slack: null };
  for (const [source, file] of Object.entries({ team: config.teamFile, ysws: config.yswsFile })) {
    try {
      dates[source] = (await fs.stat(file)).mtime.toISOString().slice(0, 10);
    } catch {
      dates[source] = null;
    }
  }
  let slackSnapshot = null;
  try {
    slackSnapshot = (await fs.stat(config.announcementsFile)).mtime.toISOString().slice(0, 10);
  } catch {}
  let slackBatch = null;
  try {
    const checkedAt = (await fs.readFile(`${config.dataDir}/announcements.checked-at`, 'utf8')).trim();
    slackBatch = new Date(checkedAt).toISOString().slice(0, 10);
  } catch {}
  dates.slack = { snapshot: slackSnapshot, batch: slackBatch };
  return dates;
}

// ---------------------------------------------------------------------------
// Auth — current user
// ---------------------------------------------------------------------------
apiRouter.get('/auth/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const user = getSessionUser(req);
  res.json({ ok: true, user: user ? { ...user, emailMarketingOptIn: getEmailMarketingOptIn(user.id) } : null });
});

apiRouter.post('/account/email-preferences', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to update email preferences.' });
  if (typeof req.body?.optIn !== 'boolean') return res.status(400).json({ ok: false, error: 'Choose whether to receive Hacki updates.' });
  if (req.body.optIn && !user.email) return res.status(400).json({ ok: false, error: 'Your account does not have an email address to subscribe.' });
  setEmailMarketingOptIn(user.id, req.body.optIn);
  res.json({ ok: true, emailMarketingOptIn: req.body.optIn });
});

apiRouter.get('/admin/mentions', (req, res) => {
  const user = getSessionUser(req);
  if (!user || user.slackId !== config.adminSlackUserId) {
    return res.status(403).json({ ok: false, error: 'Admin access is restricted.' });
  }
  const mentions = getRecentSlackMentions(7).map(mention => ({
    ...mention,
    slackUrl: `https://hackclub.enterprise.slack.com/archives/${encodeURIComponent(mention.channel_id)}/p${String(mention.slack_ts).replace('.', '')}`
  }));
  res.json({ ok: true, mentions, since: new Date((Date.now() - 7 * 86400_000)).toISOString() });
});

function isAdminUser(req) {
  const user = getSessionUser(req);
  return user?.slackId === config.adminSlackUserId ? user : null;
}

apiRouter.get('/admin/email', (req, res) => {
  if (!isAdminUser(req)) return res.status(403).json({ ok: false, error: 'Admin access is restricted.' });
  res.json({ ok: true, configured: isEmailConfigured(), sender: config.mailFrom, recipients: getEmailMarketingRecipients().length });
});

apiRouter.post('/admin/email', async (req, res) => {
  if (!isAdminUser(req)) return res.status(403).json({ ok: false, error: 'Admin access is restricted.' });
  if (!isEmailConfigured()) return res.status(503).json({ ok: false, error: 'Email sending is not configured on Nest yet.' });
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();
  if (subject.length < 3 || subject.length > 180 || /[\r\n]/.test(subject)) return res.status(400).json({ ok: false, error: 'Subject must be 3 to 180 characters on one line.' });
  if (!message || message.length > 10000) return res.status(400).json({ ok: false, error: 'Message must be 1 to 10,000 characters.' });

  const recipients = getEmailMarketingRecipients();
  if (!recipients.length) return res.status(400).json({ ok: false, error: 'No members have opted in to Hacki update emails.' });

  let sent = 0;
  let failed = 0;
  for (let index = 0; index < recipients.length; index += 5) {
    const batch = recipients.slice(index, index + 5);
    const results = await Promise.allSettled(batch.map(recipient => {
      const token = crypto.createHmac('sha256', config.authClientSecret).update(recipient.id).digest('hex');
      const unsubscribeUrl = `${config.publicBaseUrl}/auth/unsubscribe?user=${encodeURIComponent(recipient.id)}&token=${token}`;
      return sendEmail({
        to: recipient.email,
        subject,
        text: `${message}\n\n---\nYou received this because you opted in to Hacki email updates. Unsubscribe: ${unsubscribeUrl}`,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      });
    }));
    for (const result of results) result.status === 'fulfilled' ? sent++ : failed++;
  }
  res.json({ ok: true, sent, failed, total: recipients.length });
});

// ---------------------------------------------------------------------------
// Chat — main endpoint
// ---------------------------------------------------------------------------
apiRouter.post('/chat', async (req, res) => {
  let heartbeat = null;
  try {
    const user = getSessionUser(req);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Please verify your Hack Club account first by signing in with Hack Club. Then I can chat with you. If you need help with verification, ask freely!' });
    }
    const { message, history, chatKey, title } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ ok: false, error: 'A valid "message" string is required.' });
    }

    // Resolve or create a chat session key
    const sessionKey = typeof chatKey === 'string' && chatKey.length <= 100
      ? chatKey
      : crypto.randomBytes(16).toString('hex');
    const userId = user.id;

    // Derive a provisional title from the first message (truncated)
    const provisionalTitle = message.slice(0, 60) + (message.length > 60 ? '…' : '');
    let chatSession = getChatSessionByKey(sessionKey);
    if (chatSession && chatSession.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Chat not found.' });
    }
    if (!chatSession) chatSession = getOrCreateChatSession(sessionKey, userId, title || provisionalTitle);
    else if (title) updateChatSessionTitle(sessionKey, userId, String(title).slice(0, 120));

    // Load history from DB if chatKey was provided; otherwise use client history.
    let aiHistory;
    if (chatKey) {
      aiHistory = getHistoryForAI(chatSession.id, 40);
    } else {
      aiHistory = (Array.isArray(history) ? history : []).map(h => ({
        role: String(h.role || 'user').slice(0, 20),
        content: String(h.content || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 4000)
      }));
    }

    // Save the user's message to DB
    appendMessage(chatSession.id, 'user', message);

    // A website sign-in alone is not enough. Invite the person only once they
    // actually send Hacki a chat message from the signed-in website session.
    if (user.slackId) {
      autoAddUserToHackiChannel({ slackId: user.slackId, name: user.name }).catch(err => {
        console.warn('[API /chat] Could not auto-add website chatter to #hacki:', err.message);
      });
    }

    // Stream activity and answer tokens so the browser shows retrieval work
    // immediately and proxies do not see a long silent request.
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const sendEvent = (event, value) => {
      if (!res.writableEnded && res.writable) res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    };
    heartbeat = setInterval(() => {
      if (!res.writableEnded && res.writable) res.write(': keep-alive\n\n');
    }, 12000);
    sendEvent('status', { message: 'Reading your question…' });

    let chatPreferences = {};
    try { chatPreferences = JSON.parse(getSetting(user.id, 'hacki_preferences', '{}')) || {}; } catch {}
    const result = await askHacki(message, aiHistory, {
      responseStyle: String(chatPreferences.responseStyle || 'default').slice(0, 24),
      responseLanguage: String(chatPreferences.responseLanguage || 'auto').slice(0, 12),
      customInstructions: String(chatPreferences.customInstructions || '').slice(0, 2000),
      onProgress: status => sendEvent('status', { message: status }),
      onTextDelta: text => sendEvent('delta', { text })
    });
    const resultSources = result.sources || [];
    const hasHackClubSources = resultSources.some(source => ['ysws', 'team', 'programs', 'official', 'slack', 'creator', 'tool', 'hcb', 'general'].includes(source.type));
    const dataDates = hasHackClubSources ? await getDataSnapshotDates() : null;
    const datedSources = dataDates
      ? [...resultSources, { type: 'data_snapshot', dataDates }]
      : resultSources;

    // Save the assistant's reply
    const answerMessageId = appendMessage(chatSession.id, 'assistant', result.answer, datedSources);

    sendEvent('done', {
      ok: true,
      user: user || null,
      chatKey: sessionKey,
      answerMessageId,
      ...result,
      sources: datedSources,
      ...(dataDates ? { dataDates } : {})
    });
    clearInterval(heartbeat);
    heartbeat = null;
    res.end();
  } catch (error) {
    console.error('[API /chat error]', error);
    if (heartbeat) clearInterval(heartbeat);
    if (res.headersSent) {
      if (!res.writableEnded && res.writable) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
      return;
    }
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Chat — answer feedback
// ---------------------------------------------------------------------------
apiRouter.post('/chat/feedback', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to rate answers.' });
  const messageId = Number(req.body?.messageId);
  const rating = Number(req.body?.rating);
  if (!Number.isSafeInteger(messageId) || messageId < 1 || ![-1, 1].includes(rating)) {
    return res.status(400).json({ ok: false, error: 'Choose thumbs up or thumbs down for a valid answer.' });
  }
  if (!userOwnsAssistantMessage(messageId, user.id)) return res.status(404).json({ ok: false, error: 'Answer not found.' });
  setAnswerFeedback(messageId, user.id, rating);
  res.json({ ok: true, rating });
});

// ---------------------------------------------------------------------------
// Chat history — list sessions for authenticated user
// ---------------------------------------------------------------------------
apiRouter.get('/chat/sessions', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to view chat history.' });

  const sessions = getChatSessionsByUser(user.id);
  res.json({ ok: true, sessions });
});

// Import a device's existing local conversations into the signed-in account.
apiRouter.post('/chat/sessions', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to save chats.' });

  const { sessionKey, title, messages } = req.body || {};
  if (typeof sessionKey !== 'string' || !sessionKey || sessionKey.length > 100) {
    return res.status(400).json({ ok: false, error: 'A valid session key is required.' });
  }

  const existing = getChatSessionByKey(sessionKey);
  if (existing) {
    if (existing.user_id !== user.id) return res.status(404).json({ ok: false, error: 'Chat not found.' });
    return res.json({ ok: true, session: existing, existing: true });
  }

  const session = getOrCreateChatSession(sessionKey, user.id, String(title || 'New chat').slice(0, 120));
  for (const message of (Array.isArray(messages) ? messages : []).slice(-200)) {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof (message.text ?? message.content) !== 'string') continue;
    appendMessage(session.id, message.role, String(message.text ?? message.content).slice(0, 12000), message.sources || null);
  }

  res.status(201).json({ ok: true, session: getChatSessionByKey(sessionKey), existing: false });
});

// ---------------------------------------------------------------------------
// Chat history — messages in a specific session
// ---------------------------------------------------------------------------
apiRouter.get('/chat/sessions/:key', (req, res) => {
  try {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'Sign in to view chats.' });
    const session = getChatSessionByKey(req.params.key);
    if (!session || session.user_id !== user.id) return res.status(404).json({ ok: false, error: 'Chat not found.' });
    const messages = getMessages(session.id, 200, user.id);
    res.json({ ok: true, session, messages });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Chat history — rename a session
// ---------------------------------------------------------------------------
apiRouter.patch('/chat/sessions/:key', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to rename chats.' });

  const { title } = req.body || {};
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ ok: false, error: 'A "title" string is required.' });
  }

  const changed = renameChatSession(req.params.key, title.slice(0, 120), user.id);
  if (!changed) return res.status(404).json({ ok: false, error: 'Chat not found.' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Chat history — delete a session and its messages
// ---------------------------------------------------------------------------
apiRouter.delete('/chat/sessions/:key', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to delete chats.' });

  const changed = deleteChatSession(req.params.key, user.id);
  if (!changed) return res.status(404).json({ ok: false, error: 'Chat not found.' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// User settings — get all
// ---------------------------------------------------------------------------
apiRouter.get('/settings', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to access settings.' });

  const settings = getAllSettings(user.id);
  res.json({ ok: true, settings });
});

// ---------------------------------------------------------------------------
// User settings — set one key
// ---------------------------------------------------------------------------
apiRouter.put('/settings/:key', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to change settings.' });

  const key = req.params.key;
  const { value } = req.body || {};
  if (value === undefined || value === null) {
    return res.status(400).json({ ok: false, error: '"value" is required.' });
  }

  setSetting(user.id, key, value);
  res.json({ ok: true, key, value: String(value) });
});

// ---------------------------------------------------------------------------
// User settings — delete one key
// ---------------------------------------------------------------------------
apiRouter.delete('/settings/:key', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to manage settings.' });

  deleteSetting(user.id, req.params.key);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// System status & counts
// ---------------------------------------------------------------------------
apiRouter.get('/status', async (req, res) => {
  try {
    const [team, ysws, announcements, hiring] = await Promise.all([
      loadTeam(),
      loadYSWS(),
      loadAnnouncements(),
      getHiringOpportunities()
    ]);

    res.json({
      ok: true,
      botName: 'Hacki',
      version: '1.0.0',
      aiModel: config.aiModel,
      counts: {
        teamMembers: team.length,
        totalYSWS: ysws.length,
        activeYSWS: ysws.filter(p => p.isActive).length,
        newYSWS: ysws.filter(p => p.isNew).length,
        announcements: announcements.length,
        hiringOpportunities: hiring.length
      },
      slackConnected: Boolean(config.slackBotToken)
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Team directory search
// ---------------------------------------------------------------------------
apiRouter.get('/team', async (req, res) => {
  try {
    const q = req.query.q || '';
    const results = await searchTeam(String(q));
    res.json({ ok: true, count: results.length, members: results });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// YSWS catalog search
// ---------------------------------------------------------------------------
apiRouter.get('/ysws', async (req, res) => {
  try {
    const q = req.query.q || '';
    const newOnly = req.query.new === 'true';
    if (newOnly) {
      const results = await getNewYSWS();
      return res.json({ ok: true, count: results.length, programs: results });
    }
    const results = await searchYSWS(String(q));
    res.json({ ok: true, count: results.length, programs: results });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Hiring & reviewer opportunities
// ---------------------------------------------------------------------------
apiRouter.get('/opportunities', async (req, res) => {
  if (!getSessionUser(req)) {
    return res.status(401).json({ ok: false, error: 'Please verify your Hack Club account by signing in to view Slack opportunities.' });
  }
  try {
    const query = String(req.query.q || '').trim().slice(0, 160);
    const type = ['all', 'roles', 'programs', 'events'].includes(req.query.type) ? req.query.type : 'all';
    const requestedDays = Number.parseInt(String(req.query.days || '7'), 10);
    const days = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 1), 30) : 7;
    const cutoffTimestamp = (Date.now() - days * 24 * 60 * 60 * 1000) / 1000;
    const base = query ? await searchAnnouncements(query, { limit: 1000 }) : await loadAnnouncements();
    const today = new Date().toISOString().slice(0, 10);
    let sourceAvailable = true;
    let sourceCheckedAt = null;
    try {
      await fs.access(config.announcementsFile);
      try { sourceCheckedAt = (await fs.readFile(`${config.dataDir}/announcements.checked-at`, 'utf8')).trim() || null; } catch {}
    } catch { sourceAvailable = false; }
    const opportunities = base
      .filter(item => {
        const timestamp = Number(String(item.timestamp || '').split('.')[0]);
        if (!Number.isFinite(timestamp) || timestamp < cutoffTimestamp) return false;
        const categories = Array.isArray(item.categories) ? item.categories : [];
        const tags = Array.isArray(item.tags) ? item.tags : [];
        const role = item.isHiring || categories.includes('hiring') || tags.includes('hiring');
        const program = item.isYSWS || categories.includes('ysws') || tags.includes('ysws');
        const event = item.isEvent || item.kind === 'event' || categories.includes('event') || tags.includes('event');
        const opportunity = item.isOpportunity || categories.includes('opportunity') || tags.includes('opportunity');
        if (type === 'roles') return role;
        if (type === 'programs') return program || opportunity;
        if (type === 'events') return event;
        return role || program || event || opportunity;
      })
      .sort((a, b) => Number(String(b.timestamp || 0).split('.')[0]) - Number(String(a.timestamp || 0).split('.')[0]))
      .slice(0, 1000)
      .map(item => {
        const publishedDate = item.timestamp
          ? new Date(Number(String(item.timestamp).split('.')[0]) * 1000).toISOString().slice(0, 10)
          : null;
        const eventDate = item.eventDate || null;
        const deadlineMatch = `${item.title || ''}\n${item.cleanText || item.summary || ''}`.match(/\b(?:deadline|closes?|due)\b[^\n.]{0,50}?\b(?:on\s+)?([A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})/i);
        const parsedDeadline = deadlineMatch?.[1] ? Date.parse(deadlineMatch[1]) : NaN;
        const deadline = Number.isFinite(parsedDeadline) ? new Date(parsedDeadline).toISOString().slice(0, 10) : null;
        const status = eventDate && eventDate < today
          ? 'Past event'
          : deadline && deadline < today
            ? 'Deadline passed'
            : deadline
              ? `Deadline ${deadline}`
              : 'Check source for current status';
        return {
          id: item.id,
          title: item.eventTitle || item.title || 'Hack Club update',
          summary: item.cleanText || item.summary || item.slackSummary || '',
          channel: item.channel || item.source || 'Hack Club',
          url: item.url || item.eventUrl || null,
          publishedDate,
          eventDate,
          deadline,
          status,
          kind: item.kind || (item.isHiring ? 'role' : item.isYSWS ? 'program' : 'opportunity')
        };
      });
    res.json({
      ok: true,
      count: opportunities.length,
      query,
      type,
      days,
      opportunities,
      snapshotDate: today,
      sourceAvailable,
      sourceCheckedAt,
      sourceNotice: sourceAvailable ? null : 'Hacki has not collected a Slack opportunities snapshot yet. The Slack app needs the channels:history scope and must be reinstalled in the workspace before it can read public-channel posts.'
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Manual data sync
// ---------------------------------------------------------------------------
apiRouter.post('/sync', async (req, res) => {
  try {
    console.log('[API /sync] Manual sync triggered.');
    Promise.all([fetchTeam(), fetchYSWS()]).catch(err => {
      console.error('[API /sync background error]', err);
    });
    res.json({ ok: true, message: 'Sync started for team directory and YSWS catalog.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
