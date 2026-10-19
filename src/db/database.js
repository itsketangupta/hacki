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

    -- Per-user key/value settings store
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key       TEXT NOT NULL,
      value     TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    );
  `);
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

export function upsertUser(user) {
  const db = getDb();
  db.prepare(`
    INSERT INTO users (id, name, email, slack_id, slack_url, avatar,
                       slack_channel_status, slack_channel_joined, slack_channel_id,
                       first_seen_at, last_login_at)
    VALUES (@id, @name, @email, @slackId, @slackUrl, @avatar,
            @slackChannelStatus, @slackChannelJoined, @slackChannelId,
            @firstSeenAt, @lastLoginAt)
    ON CONFLICT(id) DO UPDATE SET
      name                 = excluded.name,
      email                = excluded.email,
      slack_id             = excluded.slack_id,
      slack_url            = excluded.slack_url,
      avatar               = excluded.avatar,
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
  db.prepare(`
    INSERT INTO chat_messages (chat_session_id, role, content, sources)
    VALUES (?, ?, ?, ?)
  `).run(chatSessionId, role, content, sources ? JSON.stringify(sources) : null);

  // Bump updated_at on parent session
  db.prepare(`
    UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?
  `).run(chatSessionId);
}

export function getMessages(chatSessionId, limit = 200) {
  const rows = getDb().prepare(`
    SELECT * FROM chat_messages
    WHERE chat_session_id = ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(chatSessionId, limit);

  return rows.map(r => ({
    id: r.id,
    role: r.role,
    content: r.content,
    sources: r.sources ? JSON.parse(r.sources) : null,
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
