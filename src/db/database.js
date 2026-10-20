/**
 * database.js — SQLite setup for Hacki
 *
 * Tables:
 *   users          — registered Hack Club members
 *   sessions       — active login sessions
 *   chat_sessions  — named conversation threads per user
 *   chat_messages  — individual messages in each thread
 *   user_settings  — per-user preferences (key/value)
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

// Ensure data directory exists
fs.mkdirSync(config.dataDir, { recursive: true });

const DB_PATH = path.join(config.dataDir, 'hacki.db');

let _db = null;

export function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);

  // WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  migrate(_db);
  return _db;
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

function migrate(db) {
  db.exec(`
    -- Users registered via Hack Club OAuth
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      email        TEXT,
      slack_id     TEXT,
      slack_url    TEXT,
      avatar       TEXT,
      email_marketing_opt_in INTEGER NOT NULL DEFAULT 0,
      email_marketing_opt_in_at TEXT,
      welcome_email_eligible INTEGER NOT NULL DEFAULT 0,
      welcome_email_sent_at TEXT,
      welcome_email_claimed_at TEXT,
      slack_channel_status TEXT DEFAULT 'pending',
      slack_channel_joined INTEGER DEFAULT 0,
      slack_channel_id     TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Active login sessions (replaces sessions.json + in-memory Map)
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_json  TEXT NOT NULL,                      -- cached full user object for fast lookup
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- Named conversation threads (one per tab/topic)
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT,                              -- NULL = guest session
      session_key TEXT NOT NULL UNIQUE,              -- random slug shared with frontend
      title       TEXT NOT NULL DEFAULT 'New Chat',
      model       TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

    -- Individual messages inside a conversation
    CREATE TABLE IF NOT EXISTS chat_messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content         TEXT NOT NULL,
      sources         TEXT,     -- JSON array of citation objects (nullable)
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(chat_session_id);

    -- Per-account feedback on assistant answers.
    CREATE TABLE IF NOT EXISTS answer_feedback (
      message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating IN (-1, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (message_id, user_id)
    );

    -- Per-user key/value settings store
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key       TEXT NOT NULL,
      value     TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    );

    -- Explicit per-Slack-user memories and durable Slack reminders.
    CREATE TABLE IF NOT EXISTS slack_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_user_id TEXT NOT NULL,
      memory TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_slack_memories_user ON slack_memories(slack_user_id);

    CREATE TABLE IF NOT EXISTS slack_instructions (
      slack_user_id TEXT PRIMARY KEY,
      instructions TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS slack_model_overrides (
      slack_user_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      encrypted_api_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS slack_mcp_servers (
      server_id TEXT PRIMARY KEY,
      slack_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      encrypted_token TEXT,
      iv TEXT,
      auth_tag TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(slack_user_id, name)
    );

    CREATE TABLE IF NOT EXISTS slack_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      thread_ts TEXT,
      reminder_text TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      interval_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_slack_reminders_due ON slack_reminders(due_at);

    CREATE TABLE IF NOT EXISTS slack_sandboxes (
      thread_key TEXT PRIMARY KEY,
      slack_user_id TEXT NOT NULL DEFAULT '',
      sandbox_id TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS slack_mentions (
      event_key TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      user_id TEXT,
      message_text TEXT NOT NULL,
      reply_text TEXT,
      occurred_at INTEGER NOT NULL,
      slack_ts TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_slack_mentions_occurred_at ON slack_mentions(occurred_at DESC);
  `);

  const sandboxColumns = db.prepare('PRAGMA table_info(slack_sandboxes)').all();
  if (!sandboxColumns.some(column => column.name === 'slack_user_id')) {
    db.exec("ALTER TABLE slack_sandboxes ADD COLUMN slack_user_id TEXT NOT NULL DEFAULT ''");
  }
  const mentionColumns = db.prepare('PRAGMA table_info(slack_mentions)').all();
  if (!mentionColumns.some(column => column.name === 'reply_text')) {
    db.exec('ALTER TABLE slack_mentions ADD COLUMN reply_text TEXT');
  }
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some(column => column.name === 'email_marketing_opt_in')) db.exec('ALTER TABLE users ADD COLUMN email_marketing_opt_in INTEGER NOT NULL DEFAULT 0');
  if (!userColumns.some(column => column.name === 'email_marketing_opt_in_at')) db.exec('ALTER TABLE users ADD COLUMN email_marketing_opt_in_at TEXT');
  if (!userColumns.some(column => column.name === 'welcome_email_eligible')) db.exec('ALTER TABLE users ADD COLUMN welcome_email_eligible INTEGER NOT NULL DEFAULT 0');
  if (!userColumns.some(column => column.name === 'welcome_email_sent_at')) db.exec('ALTER TABLE users ADD COLUMN welcome_email_sent_at TEXT');
  if (!userColumns.some(column => column.name === 'welcome_email_claimed_at')) db.exec('ALTER TABLE users ADD COLUMN welcome_email_claimed_at TEXT');
}

export function recordSlackMention({ eventKey, channelId, channelName, userId, messageText, occurredAt, slackTs }) {
  if (!eventKey || !channelId || !messageText) return;
  getDb().prepare(`INSERT OR IGNORE INTO slack_mentions
    (event_key, channel_id, channel_name, user_id, message_text, occurred_at, slack_ts)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(eventKey, channelId, channelName || null, userId || null, String(messageText).slice(0, 4000), occurredAt || Math.floor(Date.now() / 1000), String(slackTs || occurredAt || Math.floor(Date.now() / 1000)));
}

export function getRecentSlackMentions(days = 7) {
  const since = Math.floor(Date.now() / 1000) - Math.max(1, Math.min(30, days)) * 86400;
  return getDb().prepare(`SELECT event_key, channel_id, channel_name, user_id, message_text, occurred_at
    FROM slack_mentions WHERE occurred_at >= ? ORDER BY occurred_at DESC LIMIT 500`).all(since);
}

export function recordSlackClarification(eventKey, replyText) {
  if (!eventKey || !replyText) return;
  getDb().prepare('UPDATE slack_mentions SET reply_text = ? WHERE event_key = ?')
    .run(String(replyText).slice(0, 4000), eventKey);
}

export function getSlackSandbox(threadKey) {
  return getDb().prepare('SELECT sandbox_id FROM slack_sandboxes WHERE thread_key = ?').get(threadKey)?.sandbox_id || null;
}

export function saveSlackSandbox(threadKey, sandboxId, slackUserId) {
  getDb().prepare(`INSERT INTO slack_sandboxes (thread_key, slack_user_id, sandbox_id, updated_at)
    VALUES (?, ?, ?, datetime('now')) ON CONFLICT(thread_key) DO UPDATE SET
    slack_user_id = excluded.slack_user_id, sandbox_id = excluded.sandbox_id, updated_at = excluded.updated_at`)
    .run(threadKey, slackUserId || '', sandboxId);
}

export function getSlackSandboxesForUser(slackUserId) {
  return getDb().prepare('SELECT sandbox_id FROM slack_sandboxes WHERE slack_user_id = ?').all(slackUserId).map(row => row.sandbox_id);
}

export function deleteSlackSandboxesForUser(slackUserId) {
  return getDb().prepare('DELETE FROM slack_sandboxes WHERE slack_user_id = ?').run(slackUserId).changes;
}

export function eraseSlackUserData(slackUserId) {
  const db = getDb();
  const erase = db.transaction(id => {
    db.prepare('DELETE FROM slack_memories WHERE slack_user_id = ?').run(id);
    db.prepare('DELETE FROM slack_instructions WHERE slack_user_id = ?').run(id);
    db.prepare('DELETE FROM slack_model_overrides WHERE slack_user_id = ?').run(id);
    db.prepare('DELETE FROM slack_mcp_servers WHERE slack_user_id = ?').run(id);
    db.prepare('DELETE FROM slack_reminders WHERE slack_user_id = ?').run(id);
    db.prepare('DELETE FROM slack_sandboxes WHERE slack_user_id = ?').run(id);
  });
  erase(slackUserId);
}

export function addSlackMemory(slackUserId, memory) {
  const value = String(memory || '').trim().slice(0, 1000);
  if (!slackUserId || !value) return false;
  const existing = getDb().prepare(`SELECT id FROM slack_memories
    WHERE slack_user_id = ? AND lower(memory) = lower(?)`).get(slackUserId, value);
  if (existing) return false;
  getDb().prepare('INSERT INTO slack_memories (slack_user_id, memory) VALUES (?, ?)').run(slackUserId, value);
  getDb().prepare(`DELETE FROM slack_memories WHERE slack_user_id = ? AND id NOT IN
    (SELECT id FROM slack_memories WHERE slack_user_id = ? ORDER BY id DESC LIMIT 30)`)
    .run(slackUserId, slackUserId);
  return true;
}

export function getSlackMemories(slackUserId) {
  return getDb().prepare(`SELECT id, memory FROM slack_memories
    WHERE slack_user_id = ? ORDER BY id DESC LIMIT 30`).all(slackUserId).reverse();
}

export function deleteSlackMemories(slackUserId) {
  return getDb().prepare('DELETE FROM slack_memories WHERE slack_user_id = ?').run(slackUserId).changes;
}

export function setSlackInstructions(slackUserId, instructions) {
  const value = String(instructions || '').trim().slice(0, 1500);
  if (!value) return false;
  getDb().prepare(`INSERT INTO slack_instructions (slack_user_id, instructions, updated_at)
    VALUES (?, ?, datetime('now')) ON CONFLICT(slack_user_id) DO UPDATE SET
    instructions = excluded.instructions, updated_at = excluded.updated_at`).run(slackUserId, value);
  return true;
}

export function getSlackInstructions(slackUserId) {
  return getDb().prepare('SELECT instructions FROM slack_instructions WHERE slack_user_id = ?').get(slackUserId)?.instructions || '';
}

export function deleteSlackInstructions(slackUserId) {
  return getDb().prepare('DELETE FROM slack_instructions WHERE slack_user_id = ?').run(slackUserId).changes;
}

export function saveSlackModelOverride(slackUserId, value) {
  getDb().prepare(`INSERT INTO slack_model_overrides
    (slack_user_id, provider, model, encrypted_api_key, iv, auth_tag, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(slack_user_id) DO UPDATE SET
    provider = excluded.provider, model = excluded.model, encrypted_api_key = excluded.encrypted_api_key,
    iv = excluded.iv, auth_tag = excluded.auth_tag, updated_at = excluded.updated_at`)
    .run(slackUserId, value.provider, value.model, value.encryptedApiKey, value.iv, value.authTag);
}

export function getSlackModelOverride(slackUserId) {
  return getDb().prepare(`SELECT provider, model, encrypted_api_key AS encryptedApiKey, iv, auth_tag AS authTag
    FROM slack_model_overrides WHERE slack_user_id = ?`).get(slackUserId) || null;
}

export function deleteSlackModelOverride(slackUserId) {
  return getDb().prepare('DELETE FROM slack_model_overrides WHERE slack_user_id = ?').run(slackUserId).changes;
}

export function saveSlackMcpServer(value) {
  getDb().prepare(`INSERT INTO slack_mcp_servers
    (server_id, slack_user_id, name, endpoint, encrypted_token, iv, auth_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(value.serverId, value.slackUserId, value.name, value.endpoint, value.encryptedToken || null, value.iv || null, value.authTag || null);
}

export function getSlackMcpServers(slackUserId) {
  return getDb().prepare(`SELECT server_id AS serverId, slack_user_id AS slackUserId, name, endpoint,
    encrypted_token AS encryptedToken, iv, auth_tag AS authTag
    FROM slack_mcp_servers WHERE slack_user_id = ? ORDER BY created_at, name`).all(slackUserId);
}

export function deleteSlackMcpServer(slackUserId, serverId) {
  return getDb().prepare('DELETE FROM slack_mcp_servers WHERE slack_user_id = ? AND server_id = ?').run(slackUserId, serverId).changes;
}

export function addSlackReminder({ slackUserId, channelId, threadTs, reminderText, dueAt, intervalMs = null }) {
  return getDb().prepare(`INSERT INTO slack_reminders
    (slack_user_id, channel_id, thread_ts, reminder_text, due_at, interval_ms)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(slackUserId, channelId, threadTs || null, String(reminderText).slice(0, 1000), dueAt, intervalMs).lastInsertRowid;
}

export function getDueSlackReminders(now = Date.now(), limit = 20) {
  return getDb().prepare(`SELECT * FROM slack_reminders WHERE due_at <= ? ORDER BY due_at LIMIT ?`).all(now, limit);
}

export function getSlackRemindersForUser(slackUserId, limit = 20) {
  return getDb().prepare(`SELECT id, reminder_text, due_at, interval_ms FROM slack_reminders
    WHERE slack_user_id = ? ORDER BY due_at LIMIT ?`).all(slackUserId, limit);
}

export function deleteSlackReminder(slackUserId, id) {
  return getDb().prepare('DELETE FROM slack_reminders WHERE slack_user_id = ? AND id = ?').run(slackUserId, id).changes;
}

export function completeSlackReminder(id, intervalMs = null, nextDueAt = null) {
  if (intervalMs && nextDueAt) {
    return getDb().prepare('UPDATE slack_reminders SET due_at = ? WHERE id = ?').run(nextDueAt, id).changes;
  }
  return getDb().prepare('DELETE FROM slack_reminders WHERE id = ?').run(id).changes;
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

export function upsertUser(user) {
  const db = getDb();
  db.prepare(`
    INSERT INTO users (id, name, email, slack_id, slack_url, avatar, email_marketing_opt_in, email_marketing_opt_in_at, welcome_email_eligible,
                       slack_channel_status, slack_channel_joined, slack_channel_id,
                       first_seen_at, last_login_at)
    VALUES (@id, @name, @email, @slackId, @slackUrl, @avatar, @emailMarketingOptIn,
            CASE WHEN @emailMarketingOptIn = 1 THEN datetime('now') ELSE NULL END, @welcomeEmailEligible,
            @slackChannelStatus, @slackChannelJoined, @slackChannelId,
            @firstSeenAt, @lastLoginAt)
    ON CONFLICT(id) DO UPDATE SET
      name                 = excluded.name,
      email                = excluded.email,
      slack_id             = excluded.slack_id,
      slack_url            = excluded.slack_url,
      avatar               = excluded.avatar,
      email_marketing_opt_in = CASE WHEN excluded.email_marketing_opt_in = 1 THEN 1 ELSE users.email_marketing_opt_in END,
      email_marketing_opt_in_at = CASE WHEN excluded.email_marketing_opt_in = 1 THEN COALESCE(users.email_marketing_opt_in_at, datetime('now')) ELSE users.email_marketing_opt_in_at END,
      slack_channel_status = excluded.slack_channel_status,
      slack_channel_joined = excluded.slack_channel_joined,
      slack_channel_id     = excluded.slack_channel_id,
      last_login_at        = excluded.last_login_at
  `).run({
    id: user.id,
    name: user.name,
    email: user.email || null,
    slackId: user.slackId || null,
    slackUrl: user.slackUrl || null,
    avatar: user.avatar || null,
    emailMarketingOptIn: user.emailMarketingOptIn ? 1 : 0,
    welcomeEmailEligible: user.welcomeEmailEligible ? 1 : 0,
    slackChannelStatus: user.slackChannelStatus || 'pending',
    slackChannelJoined: user.slackChannelJoined ? 1 : 0,
    slackChannelId: user.slackChannelId || null,
    firstSeenAt: user.firstSeenAt || new Date().toISOString(),
    lastLoginAt: user.lastLoginAt || new Date().toISOString()
  });
}

export function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

export function getAllUsers() {
  return getDb().prepare('SELECT * FROM users ORDER BY last_login_at DESC').all();
}

export function setEmailMarketingOptIn(userId, optedIn) {
  return getDb().prepare(`UPDATE users SET email_marketing_opt_in = ?,
    email_marketing_opt_in_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?`)
    .run(optedIn ? 1 : 0, optedIn ? 1 : 0, userId).changes;
}

export function getEmailMarketingOptIn(userId) {
  return Boolean(getDb().prepare('SELECT email_marketing_opt_in FROM users WHERE id = ?').get(userId)?.email_marketing_opt_in);
}

export function getEmailMarketingRecipients() {
  return getDb().prepare(`SELECT id, name, email FROM users
    WHERE email_marketing_opt_in = 1 AND email IS NOT NULL AND email != '' ORDER BY first_seen_at`).all();
}

export function claimWelcomeEmail(userId) {
  return getDb().prepare(`UPDATE users SET welcome_email_claimed_at = datetime('now')
    WHERE id = ? AND welcome_email_eligible = 1 AND welcome_email_sent_at IS NULL
      AND (welcome_email_claimed_at IS NULL OR julianday(welcome_email_claimed_at) < julianday('now', '-10 minutes'))`).run(userId).changes === 1;
}

export function markWelcomeEmailSent(userId) {
  getDb().prepare(`UPDATE users SET welcome_email_sent_at = datetime('now'), welcome_email_claimed_at = NULL,
    welcome_email_eligible = 0 WHERE id = ?`).run(userId);
}

export function releaseWelcomeEmailClaim(userId) {
  getDb().prepare('UPDATE users SET welcome_email_claimed_at = NULL WHERE id = ? AND welcome_email_sent_at IS NULL').run(userId);
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

const SESSION_TTL_DAYS = 30;

export function createSession(sessionId, user) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000).toISOString();
  db.prepare(`
    INSERT INTO sessions (session_id, user_id, user_json, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET user_json = excluded.user_json, expires_at = excluded.expires_at
  `).run(sessionId, user.id, JSON.stringify(user), expiresAt);
}

export function getSession(sessionId) {
  const row = getDb().prepare(`
    SELECT * FROM sessions
    WHERE session_id = ? AND julianday(expires_at) > julianday('now')
  `).get(sessionId);
  if (!row) return null;
  try {
    return JSON.parse(row.user_json);
  } catch {
    return null;
  }
}

export function deleteSession(sessionId) {
  getDb().prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
}

export function deleteUserSessions(userId) {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/** Purge sessions that have already expired — call periodically */
export function pruneExpiredSessions() {
  getDb().prepare(`
    DELETE FROM sessions
    WHERE julianday(expires_at) <= julianday('now') OR julianday(expires_at) IS NULL
  `).run();
}

// ---------------------------------------------------------------------------
// Chat session helpers
// ---------------------------------------------------------------------------

export function getOrCreateChatSession(sessionKey, userId = null, title = 'New Chat') {
  const db = getDb();
  let row = db.prepare('SELECT * FROM chat_sessions WHERE session_key = ?').get(sessionKey);
  if (!row) {
    const result = db.prepare(`
      INSERT INTO chat_sessions (user_id, session_key, title)
      VALUES (?, ?, ?)
    `).run(userId, sessionKey, title);
    row = db.prepare('SELECT * FROM chat_sessions WHERE id = ?').get(result.lastInsertRowid);
  }
  return row;
}

export function getChatSessionsByUser(userId) {
  return getDb()
    .prepare('SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId);
}

export function getChatSessionByKey(sessionKey) {
  return getDb().prepare('SELECT * FROM chat_sessions WHERE session_key = ?').get(sessionKey) || null;
}

export function updateChatSessionTitle(sessionKey, userId, title) {
  return getDb().prepare(`
    UPDATE chat_sessions SET title = ?, updated_at = datetime('now')
    WHERE session_key = ? AND user_id = ?
  `).run(title, sessionKey, userId).changes;
}

export function renameChatSession(sessionKey, title, userId) {
  return getDb().prepare(`
    UPDATE chat_sessions SET title = ?, updated_at = datetime('now')
    WHERE session_key = ? AND user_id = ?
  `).run(title, sessionKey, userId).changes;
}

export function deleteChatSession(sessionKey, userId) {
  return getDb().prepare('DELETE FROM chat_sessions WHERE session_key = ? AND user_id = ?').run(sessionKey, userId).changes;
}

// ---------------------------------------------------------------------------
// Chat message helpers
// ---------------------------------------------------------------------------

export function appendMessage(chatSessionId, role, content, sources = null) {
  const db = getDb();
  const inserted = db.prepare(`
    INSERT INTO chat_messages (chat_session_id, role, content, sources)
    VALUES (?, ?, ?, ?)
  `).run(chatSessionId, role, content, sources ? JSON.stringify(sources) : null);

  // Bump updated_at on parent session
  db.prepare(`
    UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?
  `).run(chatSessionId);
  return Number(inserted.lastInsertRowid);
}

export function setAnswerFeedback(messageId, userId, rating) {
  getDb().prepare(`
    INSERT INTO answer_feedback (message_id, user_id, rating) VALUES (?, ?, ?)
    ON CONFLICT(message_id, user_id) DO UPDATE SET rating = excluded.rating, created_at = datetime('now')
  `).run(messageId, userId, rating);
}

export function getAnswerFeedback(messageId, userId) {
  return getDb().prepare('SELECT rating FROM answer_feedback WHERE message_id = ? AND user_id = ?')
    .get(messageId, userId)?.rating ?? null;
}

export function userOwnsAssistantMessage(messageId, userId) {
  return Boolean(getDb().prepare(`
    SELECT 1 FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.chat_session_id
    WHERE m.id = ? AND m.role = 'assistant' AND s.user_id = ?
  `).get(messageId, userId));
}

export function getMessages(chatSessionId, limit = 200, feedbackUserId = null) {
  const rows = getDb().prepare(`
    SELECT m.*, f.rating AS feedback_rating FROM chat_messages m
    LEFT JOIN answer_feedback f ON f.message_id = m.id AND f.user_id = ?
    WHERE m.chat_session_id = ?
    ORDER BY m.created_at ASC
    LIMIT ?
  `).all(feedbackUserId, chatSessionId, limit);

  return rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
    sources: r.sources ? JSON.parse(r.sources) : null,
    feedback: r.feedback_rating ?? null,
    createdAt: r.created_at
  }));
}

/** Returns only {role, content} pairs suitable for the AI history array */
export function getHistoryForAI(chatSessionId, maxMessages = 40) {
  return getDb().prepare(`
    SELECT role, content FROM chat_messages
    WHERE chat_session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(chatSessionId, maxMessages).reverse();
}

export function deleteMessages(chatSessionId) {
  getDb().prepare('DELETE FROM chat_messages WHERE chat_session_id = ?').run(chatSessionId);
}

// ---------------------------------------------------------------------------
// User settings helpers
// ---------------------------------------------------------------------------

export function getSetting(userId, key, defaultValue = null) {
  const row = getDb().prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?').get(userId, key);
  return row ? row.value : defaultValue;
}

export function setSetting(userId, key, value) {
  getDb().prepare(`
    INSERT INTO user_settings (user_id, key, value, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(userId, key, String(value));
}

export function getAllSettings(userId) {
  const rows = getDb().prepare('SELECT key, value FROM user_settings WHERE user_id = ?').all(userId);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function deleteSetting(userId, key) {
  getDb().prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?').run(userId, key);
}
