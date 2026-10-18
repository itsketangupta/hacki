import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import {
  upsertUser,
  createSession,
  getSession,
  deleteSession,
  pruneExpiredSessions
} from '../db/database.js';

export const authRouter = express.Router();

const oauthStates = new Map();

// Prune stale DB sessions once at startup
pruneExpiredSessions();

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try { cookies[key] = decodeURIComponent(val); }
      catch { cookies[key] = val; }
    }
  }
  return cookies;
}

export function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.hacki_session || cookies.hackwire_session;
  if (!sid) return null;
  return getSession(sid);
}

// ---------------------------------------------------------------------------
// 1. Initiate login
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 2. OAuth Callback
// ---------------------------------------------------------------------------
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
      slackChannelStatus: 'not_requested',
      slackChannelJoined: false
    };

    // Persist user to SQLite (upsert)
    upsertUser(user);

    // Create session in SQLite
    const sessionId = crypto.randomBytes(32).toString('hex');
    createSession(sessionId, user);

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

// ---------------------------------------------------------------------------
// 3. Logout
// ---------------------------------------------------------------------------
authRouter.get('/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.hacki_session) deleteSession(cookies.hacki_session);
  if (cookies.hackwire_session) deleteSession(cookies.hackwire_session);

  res.setHeader('Set-Cookie', [
    'hackwire_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
    'hacki_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
  ]);
  res.redirect('/');
});
