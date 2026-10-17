import express from 'express';
import crypto from 'node:crypto';
import { askHacki } from '../ai/hackiAgent.js';
import { loadTeam, searchTeam, fetchTeam } from '../scrapers/teamScraper.js';
import { loadYSWS, searchYSWS, getNewYSWS, getActiveYSWS, fetchYSWS } from '../scrapers/yswsScraper.js';
import { loadAnnouncements, getHiringOpportunities, getRecentAnnouncements } from '../slack/announcementsCollector.js';
import { getSessionUser } from '../auth/hackclubAuth.js';
import { config } from '../config.js';
import {
  getOrCreateChatSession,
  getChatSessionsByUser,
  renameChatSession,
  deleteChatSession,
  appendMessage,
  getMessages,
  getHistoryForAI,
  deleteMessages,
  getSetting,
  setSetting,
  getAllSettings,
  deleteSetting
} from '../db/database.js';

export const apiRouter = express.Router();

// ---------------------------------------------------------------------------
// Auth — current user
// ---------------------------------------------------------------------------
apiRouter.get('/auth/me', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  const user = getSessionUser(req);
  res.json({ ok: true, user: user || null });
});

// ---------------------------------------------------------------------------
// Chat — main endpoint
// ---------------------------------------------------------------------------
apiRouter.post('/chat', async (req, res) => {
  try {
    const user = getSessionUser(req);
    const { message, history, chatKey } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ ok: false, error: 'A valid "message" string is required.' });
    }

    // Resolve or create a chat session key
    const sessionKey = chatKey || crypto.randomBytes(12).toString('hex');
    const userId = user?.id || null;

    // Derive a provisional title from the first message (truncated)
    const provisionalTitle = message.slice(0, 60) + (message.length > 60 ? '…' : '');
    const chatSession = getOrCreateChatSession(sessionKey, userId, provisionalTitle);

    // Load history from DB if chatKey was provided; otherwise fall back to
    // the history array sent by the client (backward-compat for guests without chatKey)
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

    // Call the AI
    const result = await askHacki(message, aiHistory);

    // Save the assistant's reply
    appendMessage(chatSession.id, 'assistant', result.answer, result.sources || null);

    res.json({
      ok: true,
      user: user || null,
      chatKey: sessionKey,
      ...result
    });
  } catch (error) {
    console.error('[API /chat error]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
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

// ---------------------------------------------------------------------------
// Chat history — messages in a specific session
// ---------------------------------------------------------------------------
apiRouter.get('/chat/sessions/:key', (req, res) => {
  try {
    const session = getOrCreateChatSession(req.params.key);
    const messages = getMessages(session.id);
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

  renameChatSession(req.params.key, title.slice(0, 120));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Chat history — delete a session and its messages
// ---------------------------------------------------------------------------
apiRouter.delete('/chat/sessions/:key', (req, res) => {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Sign in to delete chats.' });

  deleteChatSession(req.params.key);
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
  try {
    const opportunities = await getHiringOpportunities();
    res.json({ ok: true, count: opportunities.length, opportunities });
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
