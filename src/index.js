import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { apiRouter } from './routes/api.js';
import { loadTeam, fetchTeam } from './scrapers/teamScraper.js';
import { loadYSWS, fetchYSWS } from './scrapers/yswsScraper.js';
import { initSlackCollector } from './slack/announcementsCollector.js';
import { initSlackBot } from './slack/slackBot.js';
import { authRouter } from './auth/hackclubAuth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

const app = express();

app.use(express.json());
app.use(express.static(publicDir));
app.use('/auth', authRouter);
app.use('/api', apiRouter);

// Fallback to index.html for SPA routes (Express 5 compatible)
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/auth')) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  next();
});

async function start() {
  console.log(`
  ======================================================
     _    _            _    _ 
    | |  | |          | |  (_)
    | |__| | __ _  ___| | ___ 
    |  __  |/ _\` |/ __| |/ / |
    | |  | | (_| | (__|   <| |
    |_|  |_|\__,_|\___|_|\_\_|
    
    Hacki — Hack Club AI Assistant (Team, YSWS & Opps)
  ======================================================
  `);

  // 1. Warm-up and load data
  console.log('[Hacki] Initializing data sources...');
  try {
    await Promise.all([
      loadTeam(),
      loadYSWS()
    ]);
  } catch (err) {
    console.warn(`[Hacki] Data load notice: ${err.message}`);
  }

  // 2. Initialize Slack collector & bot
  await initSlackCollector();
  await initSlackBot();

  // 3. Start Express server
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[Hacki] Server is live at http://localhost:${config.port}`);
    console.log(`[Hacki] Ready to answer questions about Hack Club!`);
  });

  // Background refresh of team & YSWS data every 6 hours
  setInterval(() => {
    console.log('[Hacki] Running periodic refresh of Team and YSWS catalog...');
    fetchTeam().catch(() => {});
    fetchYSWS().catch(() => {});
  }, 6 * 60 * 60 * 1000);

  const shutdown = () => {
    console.log('\n[Hacki] Gracefully shutting down...');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Prevent crashes from unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    console.warn('[Hacki] Unhandled rejection (non-fatal):', reason?.message || reason);
  });
  process.on('uncaughtException', (err) => {
    console.warn('[Hacki] Uncaught exception (non-fatal):', err?.message || err);
  });
}

start().catch(err => {
  console.error('[Hacki] Fatal startup error:', err);
  process.exit(1);
});
