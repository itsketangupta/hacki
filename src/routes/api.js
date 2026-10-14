import express from 'express';
import { askHacki } from '../ai/hackiAgent.js';
import { loadTeam, searchTeam, fetchTeam } from '../scrapers/teamScraper.js';
import { loadYSWS, searchYSWS, getNewYSWS, getActiveYSWS, fetchYSWS } from '../scrapers/yswsScraper.js';
import { loadAnnouncements, getHiringOpportunities, getRecentAnnouncements } from '../slack/announcementsCollector.js';
import { getSessionUser } from '../auth/hackclubAuth.js';
import { config } from '../config.js';

export const apiRouter = express.Router();

// Current authenticated user
apiRouter.get('/auth/me', (req, res) => {
  const user = getSessionUser(req);
  res.json({ ok: true, user: user || null });
});

// Chat endpoint
apiRouter.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ ok: false, error: 'A valid "message" string is required.' });
    }

    const result = await askHacki(message, Array.isArray(history) ? history : []);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[API /chat error]', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// System status & counts
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

// Team directory search
apiRouter.get('/team', async (req, res) => {
  try {
    const q = req.query.q || '';
    const results = await searchTeam(String(q));
    res.json({ ok: true, count: results.length, members: results });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// YSWS catalog search
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

// Hiring & reviewer opportunities
apiRouter.get('/opportunities', async (req, res) => {
  try {
    const opportunities = await getHiringOpportunities();
    res.json({ ok: true, count: opportunities.length, opportunities });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Trigger manual data sync
apiRouter.post('/sync', async (req, res) => {
  try {
    console.log('[API /sync] Manual sync triggered.');
    // Trigger in background
    Promise.all([fetchTeam(), fetchYSWS()]).catch(err => {
      console.error('[API /sync background error]', err);
    });

    res.json({ ok: true, message: 'Sync started for team directory and YSWS catalog.' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});
