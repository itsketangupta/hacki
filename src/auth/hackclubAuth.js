import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { addUserToHackiChannel } from '../slack/slackChannelManager.js';
import { sendWelcomeMessage } from '../slack/slackBot.js';

export const authRouter = express.Router();

const sessions = new Map();
const oauthStates = new Map();
const usersFile = path.join(config.dataDir, 'users.json');
const sessionsFile = path.join(config.dataDir, 'sessions.json');
let users = [];

async function loadUsers() {
  try {
    const raw = await fs.readFile(usersFile, 'utf8');
    users = JSON.parse(raw);
  } catch {
    users = [];
  }
}
loadUsers();

async function saveUsers() {
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(usersFile, JSON.stringify(users.slice(0, 1000), null, 2), 'utf8');
  } catch (e) {
    console.warn('[Auth] Could not save users file:', e.message);
  }
}

async function loadSessions() {
  try {
    const raw = await fs.readFile(sessionsFile, 'utf8');
    const parsed = JSON.parse(raw);
    for (const [sid, user] of Object.entries(parsed)) {
      sessions.set(sid, user);
    }
  } catch {
    // No saved sessions
  }
}
loadSessions();

async function saveSessions() {
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    const obj = {};
    for (const [sid, user] of sessions.entries()) {
      obj[sid] = user;
    }
    await fs.writeFile(sessionsFile, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.warn('[Auth] Could not save sessions file:', e.message);
  }
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.hacki_session && sessions.has(cookies.hacki_session)) {
    return sessions.get(cookies.hacki_session);
  }
  if (cookies.hackwire_session && sessions.has(cookies.hackwire_session)) {
    return sessions.get(cookies.hackwire_session);
  }
  return null;
}

// 1. Initiate login
authRouter.get('/login', (req, res) => {
  if (!config.authClientId || !config.authClientSecret) {
    return res.status(503).send(`
      <html>
        <body style="font-family:sans-serif; background:#171717; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh; text-align:center;">
          <div>
            <h2>Hack Club Auth Not Configured</h2>
            <p style="color:#b4b4b4;">Please set HACKCLUB_CLIENT_ID and HACKCLUB_CLIENT_SECRET in your .env file.</p>
            <p><a href="/" style="color:#ec3750;">&larr; Back to Hacki</a></p>
          </div>
        </body>
      </html>
    `);
  }

  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: config.authClientId,
    redirect_uri: config.authRedirectUri,
    response_type: 'code',
    scope: 'openid profile email name slack_id',
    state
  });

  res.redirect(`https://auth.hackclub.com/oauth/authorize?${params.toString()}`);
});

// 2. OAuth Callback
authRouter.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const expiry = oauthStates.get(state);
  oauthStates.delete(state);

  if (!code || !expiry || expiry < Date.now()) {
    return res.status(400).send('Login session expired or invalid. Please try again.');
  }

  try {
    const tokenRes = await fetch('https://auth.hackclub.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.authClientId,
        client_secret: config.authClientSecret,
        redirect_uri: config.authRedirectUri,
        code,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${errBody}`);
    }

    const tokenData = await tokenRes.json();
    const meRes = await fetch('https://auth.hackclub.com/api/v1/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!meRes.ok) {
      throw new Error(`User profile fetch failed (HTTP ${meRes.status})`);
    }

    const me = await meRes.json();
    const identity = me.identity || me;
    const id = identity.id || identity.email;
    const name = [identity.first_name, identity.last_name].filter(Boolean).join(' ') || identity.name || identity.email || 'Hack Club Member';
    const email = identity.primary_email || identity.email || '';
    const slackId = identity.slack_id || null;

    const user = {
      id,
      name,
      email,
      slackId,
      slackUrl: slackId ? `https://hackclub.enterprise.slack.com/team/${slackId}` : null,
      avatar: identity.avatar || null,
      lastLoginAt: new Date().toISOString(),
      slackChannelStatus: 'pending'
    };

    // Auto-add to Hacki Slack channel (#hacki) using their Slack ID
    if (slackId || email) {
      try {
        console.log(`[Auth] Auto-adding logged in user ${name} (${slackId || email}) to #hacki Slack channel...`);
        const slackResult = await addUserToHackiChannel({
          slackId,
          email,
          name
        });
        user.slackChannelStatus = slackResult.status || (slackResult.ok ? 'invited' : 'failed');
        user.slackChannelJoined = Boolean(slackResult.ok);
        if (slackResult.channelId) {
          user.slackChannelId = slackResult.channelId;
        }
      } catch (slackErr) {
        console.warn('[Auth] Slack auto-invite error:', slackErr.message);
        user.slackChannelStatus = 'error';
      }
    }

    const existingIdx = users.findIndex(u => u.id === id);
    const isNewUser = existingIdx < 0;
    if (existingIdx >= 0) {
      users[existingIdx] = { ...users[existingIdx], ...user };
    } else {
      users.unshift(user);
    }
    await saveUsers();

    // If this is a fresh new user logging in and we have their Slack ID, welcome them!
    if (isNewUser && slackId) {
      console.log(`[Auth] Fresh new user registered and logged in: ${name} (${slackId}). Sending welcome greeting.`);
      sendWelcomeMessage(slackId).catch(() => {});
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, user);
    await saveSessions();

    res.setHeader('Set-Cookie', [
      `hacki_session=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`,
      `hackwire_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`
    ]);
    res.redirect('/');
  } catch (error) {
    console.error('[Auth Callback Error]', error);
    res.status(502).send(`
      <html>
        <body style="font-family:sans-serif; background:#171717; color:#fff; display:flex; align-items:center; justify-content:center; height:100vh; text-align:center;">
          <div>
            <h2>Hack Club Auth Login Failed</h2>
            <p style="color:#ff8c9c;">${error.message}</p>
            <p><a href="/" style="color:#ec3750;">&larr; Back to Hacki</a></p>
          </div>
        </body>
      </html>
    `);
  }
});

// 3. Re-trigger Slack Channel Join
authRouter.post('/join-slack', async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Please sign in first.' });
  }

  try {
    const result = await addUserToHackiChannel({
      slackId: user.slackId,
      email: user.email,
      name: user.name
    });

    if (result.ok) {
      user.slackChannelJoined = true;
      user.slackChannelStatus = result.status;
      if (result.channelId) user.slackChannelId = result.channelId;
      await saveUsers();
    }

    res.json({ ok: result.ok, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 4. Logout
authRouter.get('/logout', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.hacki_session) sessions.delete(cookies.hacki_session);
  if (cookies.hackwire_session) sessions.delete(cookies.hackwire_session);
  await saveSessions();

  res.setHeader('Set-Cookie', [
    'hackwire_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    'hacki_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
  ]);
  res.redirect('/');
});

