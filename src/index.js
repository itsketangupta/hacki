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
import { loadOfficialKnowledge, fetchOfficialKnowledge } from './scrapers/officialKnowledge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'dist');

const app = express();

app.set('trust proxy', 1);
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
      loadYSWS(),
      loadOfficialKnowledge()
    ]);
  } catch (err) {
    console.warn(`[Hacki] Data load notice: ${err.message}`);
  }

  // 2. Start Express server first so it's always responsive
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`[Hacki] Server is live at http://localhost:${config.port}`);
    console.log(`[Hacki] Ready to answer questions about Hack Club!`);
  });

  // Also bind to port 80 if config.port is not 80 (required for Hack Club Nest reverse proxy)
  let port80Server = null;
  if (config.port !== 80) {
    try {
      port80Server = app.listen(80, '0.0.0.0', () => {
        console.log(`[Hacki] Also listening on port 80 for public proxy (hackclub.app)`);
      });
      port80Server.on('error', (err) => {
        console.warn(`[Hacki] Port 80 listener notice: ${err.message}`);
      });
    } catch (err) {
      console.warn(`[Hacki] Could not bind port 80: ${err.message}`);
    }
  }

  // 3. Initialize Slack collector & bot in background (non-blocking)
  initSlackCollector().catch(err => console.warn('[Hacki] Slack collector init warning:', err.message));
  initSlackBot().catch(err => console.warn('[Hacki] Slack bot init warning:', err.message));
  fetchOfficialKnowledge().catch(err => console.warn('[Hacki] Official knowledge refresh warning:', err.message));

  // Background refresh of team & YSWS data every 6 hours
  setInterval(() => {
    console.log('[Hacki] Running periodic refresh of Team and YSWS catalog...');
    fetchTeam().catch(() => {});
    fetchYSWS().catch(() => {});
    fetchOfficialKnowledge().catch(() => {});
  }, 6 * 60 * 60 * 1000);

  const shutdown = () => {
    console.log('\n[Hacki] Gracefully shutting down...');
    server.close(() => {
      if (port80Server) port80Server.close();
      process.exit(0);
    });
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
