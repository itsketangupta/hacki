import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { sendEmail, isEmailConfigured } from '../integrations/email.js';
import {
  upsertUser,
  createSession,
  getSession,
  deleteSession,
  pruneExpiredSessions,
  getUserById,
  claimWelcomeEmail,
  markWelcomeEmailSent,
  releaseWelcomeEmailClaim,
  setEmailMarketingOptIn
} from '../db/database.js';

export const authRouter = express.Router();

const oauthStates = new Map();

async function getSlackAvatar(slackId) {
  if (!slackId || !config.slackBotToken) return null;

  try {
    const response = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackId)}`, {
      headers: { Authorization: `Bearer ${config.slackBotToken}` }
    });
    if (!response.ok) return null;

    const result = await response.json();
    if (!result.ok) return null;
    return result.user?.profile?.image_192 || result.user?.profile?.image_72 || null;
  } catch (error) {
    console.warn('[Auth] Could not load Slack profile avatar:', error.message);
    return null;
  }
}

function makeUnsubscribeToken(userId) {
  return crypto.createHmac('sha256', config.authClientSecret).update(userId).digest('hex');
}

function validUnsubscribeRequest(userId, supplied) {
  const expectedBytes = Buffer.from(makeUnsubscribeToken(userId), 'hex');
  const suppliedBytes = Buffer.from(supplied, 'hex');
  return Boolean(userId && suppliedBytes.length === expectedBytes.length && crypto.timingSafeEqual(suppliedBytes, expectedBytes));
}

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
  oauthStates.set(state, {
    expiresAt: Date.now() + 10 * 60 * 1000,
    emailMarketingOptIn: req.query.email_updates === '1'
  });

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
  const stateData = oauthStates.get(state);
  oauthStates.delete(state);
  const expiry = typeof stateData === 'number' ? stateData : stateData?.expiresAt;

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
    const avatar = identity.avatar || await getSlackAvatar(slackId);

    const user = {
      id,
      name,
      email,
      slackId,
      slackUrl: slackId ? `https://hackclub.enterprise.slack.com/team/${slackId}` : null,
      avatar,
      emailMarketingOptIn: Boolean(stateData?.emailMarketingOptIn),
      lastLoginAt: new Date().toISOString(),
      slackChannelStatus: 'not_requested',
      slackChannelJoined: false
    };

    // Persist user to SQLite (upsert)
    user.welcomeEmailEligible = !getUserById(id);
    upsertUser(user);

    // Create session in SQLite
    const sessionId = crypto.randomBytes(32).toString('hex');
    createSession(sessionId, user);

    if (email && isEmailConfigured() && claimWelcomeEmail(id)) {
      sendEmail({
        to: email,
        subject: 'Welcome to Hacki',
        text: `Hi ${name},\n\nWelcome to Hacki! You can now chat with Hacki and explore Hack Club resources at ${config.publicBaseUrl}.\n\nThis is a one-time account welcome email.`
      }).then(() => markWelcomeEmailSent(id)).catch(error => {
        releaseWelcomeEmailClaim(id);
        console.warn('[Auth] Could not send welcome email:', error.message);
      });
    }

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
function logout(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.hacki_session) deleteSession(cookies.hacki_session);
  if (cookies.hackwire_session) deleteSession(cookies.hackwire_session);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Set-Cookie', [
    'hackwire_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'hacki_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ]);
  res.redirect('/');
}

authRouter.get('/logout', logout);
authRouter.post('/logout', logout);

authRouter.get('/unsubscribe', (req, res) => {
  const userId = String(req.query.user || '');
  const supplied = String(req.query.token || '');
  if (!validUnsubscribeRequest(userId, supplied)) return res.status(400).send('This unsubscribe link is invalid.');
  const escapeHtml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe from Hacki</title></head><body style="font-family:system-ui;max-width:560px;margin:12vh auto;padding:24px;color:#242424"><h1>Stop Hacki email updates?</h1><p>Confirm to stop optional update emails. Account-related messages may still be sent.</p><form method="post" action="/auth/unsubscribe"><input type="hidden" name="user" value="${escapeHtml(userId)}"><input type="hidden" name="token" value="${escapeHtml(supplied)}"><button style="padding:10px 16px" type="submit">Unsubscribe</button></form></body></html>`);
});

authRouter.post('/unsubscribe', express.urlencoded({ extended: false }), (req, res) => {
  const userId = String(req.body?.user || '');
  const supplied = String(req.body?.token || '');
  if (!validUnsubscribeRequest(userId, supplied)) return res.status(400).send('This unsubscribe link is invalid.');
  setEmailMarketingOptIn(userId, false);
  res.send('<!doctype html><html><head><meta charset="utf-8"><title>Email updates stopped</title></head><body style="font-family:system-ui;max-width:560px;margin:12vh auto;padding:24px;color:#242424"><h1>You are unsubscribed</h1><p>You will no longer receive Hacki update emails at this address. Account-related messages may still be sent.</p><p><a href="/">Back to Hacki</a></p></body></html>');
});
