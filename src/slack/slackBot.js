import { App } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { askHacki } from '../ai/hackiAgent.js';
import { autoJoinMatchingChannel } from './announcementsCollector.js';
import { autoAddUserToHackiChannel } from './slackChannelManager.js';
import { executeSandboxCode, readSandboxFile, removeUserSandboxes, startSandboxStaticPreview } from '../ai/codeSandbox.js';
import { renderMermaid } from '../ai/mermaidRenderer.js';
import { getPublicGitHubRepository, getPublicGitHubIssues, getPublicGitHubFile, commitGitHubFileEdit, canEditGitHubFiles } from '../scrapers/github.js';
import { sendEmail, isEmailConfigured } from '../integrations/email.js';
import { fetchWebPage } from '../scrapers/webSearch.js';
import {
  SLACK_MODEL_PROVIDERS, canEncryptUserModelKeys, saveUserModelOverride, getUserModelOverrideSummary, clearUserModelOverride
} from '../ai/slackModelOverride.js';
import { listSlackMcpServerSummaries, saveUserMcpServer, removeUserMcpServer } from '../ai/mcpServers.js';
import {
  addSlackMemory, getSlackMemories, deleteSlackMemories,
  addSlackReminder, getDueSlackReminders, completeSlackReminder,
  getSlackRemindersForUser, deleteSlackReminder, eraseSlackUserData,
  setSlackInstructions, getSlackInstructions, deleteSlackInstructions,
  recordSlackMention, recordSlackClarification, getUserBySlackId
} from '../db/database.js';

let botApp = null;
let botUserId = null;
let botTeamId = null;
const welcomedUsersFile = path.join(config.dataDir, 'welcomed_users.json');
let welcomedUsers = new Set();
const dmHistories = new Map();
const DM_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const DM_HISTORY_LIMIT = 40;
const pendingReminderIds = new Set();

function isAuthVerificationHelpRequest(text = '') {
  return /\b(auth(?:entication)?|verif(?:y|ied|ication)|sign\s?in|log\s?in|login|account)\b/i.test(text) &&
    /\b(help|how|where|can't|cannot|issue|problem|stuck|trouble|unable|need)\b/i.test(text);
}

function verificationPrompt() {
  return `Please verify your Hack Club account first by <${config.publicBaseUrl}/auth/login|signing in with Hack Club>. Then I can chat with you. If you need help with verification, just ask me here.`;
}
const pendingChannelPosts = new Map();
const pendingEmailSends = new Map();
const emailSendHistory = new Map();
const channelContextCache = new Map();
const CHANNEL_CONTEXT_TTL_MS = 10 * 60 * 1000;

function isClarificationReply(text) {
  return /(?:could|can|would) you (?:please )?(?:clarify|specify|share|tell me)|(?:what|which) (?:channel|person|project|thing|part|information) (?:are|do|did) you|what do you mean|more specific|a bit more context|more details/i.test(String(text || ''));
}

const botLogger = {
  debug: () => {},
  info: (msg, ...args) => console.log(`[SlackBot] ${msg}`, ...args),
  warn: (msg, ...args) => {
    const s = String(msg || '');
    if (s.includes('rate limit') || s.includes('retry-after')) {
      console.log(`[SlackBot] Slack API rate limit notice: will retry automatically.`);
      return;
    }
    console.warn(`[SlackBot] ${msg}`, ...args);
  },
  error: (msg, ...args) => console.error(`[SlackBot] ${msg}`, ...args),
  setLevel: () => {},
  getLevel: () => 'info',
  setName: () => {}
};

export const WELCOME_MESSAGE = "👋 Welcome to Hack Club! I am Hacki, here to help you. Whichever question you have, ask me!";

async function loadWelcomedUsers() {
  try {
    const raw = await fs.readFile(welcomedUsersFile, 'utf8');
    const list = JSON.parse(raw);
    welcomedUsers = new Set(list);
  } catch {
    welcomedUsers = new Set();
  }
}
loadWelcomedUsers();

async function saveWelcomedUsers() {
  try {
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(welcomedUsersFile, JSON.stringify([...welcomedUsers]), 'utf8');
  } catch (err) {
    console.warn('[SlackBot] Could not save welcomed users:', err.message);
  }
}

/**
 * Send the official welcome DM to a user on Slack.
 * @param {string} slackUserId
 */
export async function sendWelcomeMessage(slackUserId) {
  if (!slackUserId) return false;
  try {
    const client = botApp?.client || (config.slackBotToken ? new WebClient(config.slackBotToken) : null);
    if (!client) {
      console.warn('[SlackBot] Cannot send welcome DM: Slack client not available.');
      return false;
    }

    await client.chat.postMessage({
      channel: slackUserId,
      text: WELCOME_MESSAGE
    });

    welcomedUsers.add(slackUserId);
    saveWelcomedUsers().catch(() => {});
    console.log(`[SlackBot] Sent welcome DM to user ${slackUserId}: "${WELCOME_MESSAGE}"`);
    return true;
  } catch (err) {
    console.warn(`[SlackBot] Could not send welcome message to ${slackUserId}:`, err.message);
    return false;
  }
}

/**
 * Truncate a message to Slack's block text limit (3000 chars) and strip markdown
 * code fences that can cause issues in Slack's plain text mode.
 */
function formatForSlack(text, sources = []) {
  // Replace markdown code fences (``` ... ```) with plain indented text for Slack
  let out = String(text || '').replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => code.trim());
  out = out
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<$2|$1>')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*');
  const links = [...new Map((sources || [])
    .filter(source => source?.url && /^https?:\/\//i.test(source.url))
    .map(source => [source.url, source])).values()].slice(0, 4);
  if (links.length) {
    out += `\n\n*Sources:* ${links.map(source => `<${source.url}|${String(source.title || 'Open source').replace(/[|<>]/g, '')}>`).join(' · ')}`;
  }
  // Slack block text limit is 3000 chars
  if (out.length > 3000) {
    out = out.slice(0, 2900) + '\n\n_...response truncated. Ask on [hackclub.com](https://hackclub.com) for more!_';
  }
  return out;
}

function createSlackResponseStreamer({ client, channelId, threadTs, userId }) {
  let current = null;
  let disabled = false;

  function getStream() {
    if (!current) {
      current = client.chatStream({
        channel: channelId,
        thread_ts: threadTs,
        recipient_team_id: botTeamId,
        recipient_user_id: userId,
        buffer_size: 128
      });
    }
    return current;
  }

  async function stop(note = '') {
    if (!current) return false;
    const stream = current;
    current = null;
    try {
      await stream.stop(note ? { markdown_text: note } : undefined);
      return true;
    } catch (err) {
      disabled = true;
      console.warn(`[SlackBot] Could not stop response stream: ${err.data?.error || err.message}`);
      return false;
    }
  }

  return {
    async append(text) {
      if (disabled || !text) return;
      try {
        await getStream().append({ markdown_text: text });
      } catch (err) {
        disabled = true;
        current = null;
        console.warn(`[SlackBot] Could not append response stream: ${err.data?.error || err.message}`);
      }
    },
    async providerFailed(providerName, hasFallback) {
      if (!current) return;
      const note = hasFallback
        ? `\n\n_The ${providerName} connection stopped; continuing with the backup model._`
        : `\n\n_The ${providerName} connection stopped._`;
      await stop(note);
    },
    async finish(sources) {
      if (!current || disabled) return false;
      const sourceText = formatForSlack('', sources).trim();
      if (sourceText) {
        try { await current.append({ markdown_text: `\n\n${sourceText}` }); }
        catch (err) {
          disabled = true;
          console.warn(`[SlackBot] Could not append response sources: ${err.data?.error || err.message}`);
          return false;
        }
      }
      return stop();
    }
  };
}

function cleanMessageForContext(text = '') {
  return String(text)
    .replace(/<@([A-Z0-9]+)>/g, '@member')
    .replace(/<((?:https?:\/\/)[^>|]+)\|([^>]+)>/g, '$2 ($1)')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .trim()
    .slice(0, 3000);
}

async function getSlackThreadHistory(client, event) {
  if (!event.thread_ts) return [];
  try {
    const result = await client.conversations.replies({
      channel: event.channel,
      ts: event.thread_ts,
      limit: 100
    });
    return (result.messages || [])
      .filter(message => message.ts !== event.ts && message.text)
      .slice(-40)
      .map(message => ({
        role: message.bot_id || message.user === botApp?.botId ? 'assistant' : 'user',
        content: cleanMessageForContext(message.text)
      }));
  } catch (err) {
    console.log(`[SlackBot] Thread context unavailable; answering the mention alone (${err.data?.error || err.message}).`);
    return [];
  }
}

async function getCurrentChannelContext(client, channelId) {
  if (!channelId) return null;
  const cached = channelContextCache.get(channelId);
  if (cached && Date.now() - cached.updatedAt < CHANNEL_CONTEXT_TTL_MS) return cached.value;
  try {
    const result = await client.conversations.info({ channel: channelId });
    const channel = result.channel || {};
    const value = {
      id: channel.id || channelId,
      name: channel.name || null,
      purpose: channel.purpose?.value || '',
      topic: channel.topic?.value || ''
    };
    channelContextCache.set(channelId, { value, updatedAt: Date.now() });
    return value;
  } catch (err) {
    console.log(`[SlackBot] Current channel details unavailable (${err.data?.error || err.message}).`);
    return { id: channelId, name: null, purpose: '', topic: '' };
  }
}

async function hasHackiParticipatedInThread(client, message) {
  if (!message.thread_ts || !message.channel || !botUserId) return false;
  try {
    const result = await client.conversations.replies({
      channel: message.channel,
      ts: message.thread_ts,
      limit: 100
    });
    return (result.messages || []).some(item => item.user === botUserId || item.bot_id === botUserId);
  } catch (err) {
    console.log(`[SlackBot] Could not check thread participation (${err.data?.error || err.message}).`);
    return false;
  }
}

function getRecentDMHistory(channelId) {
  const entry = dmHistories.get(channelId);
  if (!entry || Date.now() - entry.updatedAt > DM_HISTORY_TTL_MS) {
    dmHistories.delete(channelId);
    return [];
  }
  return entry.messages.slice(-DM_HISTORY_LIMIT);
}

function saveDMHistory(channelId, messages, userId) {
  dmHistories.set(channelId, { messages: messages.slice(-DM_HISTORY_LIMIT), updatedAt: Date.now(), userId });
}

function clearDMHistoryForUser(userId) {
  for (const [channelId, entry] of dmHistories) {
    if (entry.userId === userId) dmHistories.delete(channelId);
  }
}

function parseReminder(text) {
  const match = String(text || '').trim().match(/^\/?remind\s+(?:me\s+)?(?:(?:in\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d))|(?:every\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d)))\s+(?:to\s+)?(.+)$/i);
  if (!match) return null;
  const unitMs = unit => /^s/i.test(unit) ? 1000 : /^m/i.test(unit) ? 60_000 : /^h/i.test(unit) ? 3_600_000 : 86_400_000;
  const amount = Number(match[1] || match[3]);
  const intervalMs = match[3] ? amount * unitMs(match[4]) : null;
  const delayMs = match[1] ? amount * unitMs(match[2]) : intervalMs;
  if (!Number.isFinite(delayMs) || delayMs < 10_000 || delayMs > 365 * 86_400_000) return { invalid: true };
  return { text: match[5].trim(), intervalMs, dueAt: Date.now() + delayMs };
}

async function handleSlackUtilityCommand({ userId, channelId, text, threadTs, isDM, say }) {
  const value = String(text || '').trim();
  if (!userId || !value) return false;

  if (isDM && /^erase\s+(?:my\s+)?data\s*$/i.test(value)) {
    const sandboxes = await removeUserSandboxes(userId);
    eraseSlackUserData(userId);
    dmHistories.delete(channelId);
    await say({ text: `Cleared your Hacki memories, reminders, and saved sandbox references${sandboxes.stopped ? `, and stopped ${sandboxes.stopped} sandbox${sandboxes.stopped === 1 ? '' : 'es'}` : ''}. This does not delete messages from Slack.` });
    return true;
  }

  if (isDM && /^clear\s+(?:my\s+)?instructions\s*$/i.test(value)) {
    deleteSlackInstructions(userId);
    await say({ text: 'Your custom instructions are cleared.' });
    return true;
  }
  const customInstructions = isDM ? value.match(/^instructions\s*:\s*([\s\S]+)$/i) : null;
  if (customInstructions) {
    setSlackInstructions(userId, customInstructions[1]);
    await say({ text: 'Saved. I’ll use these custom instructions in future DMs, subject to my system rules. Say “clear instructions” to remove them.' });
    return true;
  }

  if (isDM && /^\/?forget\s+(?:my\s+)?memories\s*$/i.test(value)) {
    const count = deleteSlackMemories(userId);
    await say({ text: count ? `Forgot ${count} saved ${count === 1 ? 'memory' : 'memories'}.` : 'I had no saved memories for you.' });
    return true;
  }
  if (isDM && /^\/?what\s+do\s+you\s+remember(?:\s+about\s+me)?\s*\??$/i.test(value)) {
    const memories = getSlackMemories(userId);
    await say({ text: memories.length ? `Here’s what I remember:\n${memories.map(item => `• ${item.memory}`).join('\n')}\n\nSay “forget memories” to clear these.` : 'I don’t have any saved memories for you. Say “remember: …” in a DM to save one.' });
    return true;
  }
  const memory = isDM ? value.match(/^\/?remember\s*:\s*(.+)$/i) : null;
  if (memory) {
    const saved = addSlackMemory(userId, memory[1]);
    await say({ text: saved ? 'Got it. I’ll keep that in mind for your future DMs. Say “forget memories” any time to clear it.' : 'I already have that saved, or the note was empty.' });
    return true;
  }

  if (isDM && /^(?:\/?list|\/?show)\s+(?:my\s+)?reminders\s*$/i.test(value)) {
    const reminders = getSlackRemindersForUser(userId);
    await say({ text: reminders.length
      ? reminders.map(item => `• #${item.id} — ${item.reminder_text} (${new Date(item.due_at).toISOString()}${item.interval_ms ? ', repeats' : ''})`).join('\n')
      : 'You have no pending reminders.' });
    return true;
  }
  const cancel = isDM ? value.match(/^\/?(?:cancel|delete)\s+reminder\s+#?(\d+)\s*$/i) : null;
  if (cancel) {
    const removed = deleteSlackReminder(userId, Number(cancel[1]));
    await say({ text: removed ? `Cancelled reminder #${cancel[1]}.` : `I couldn’t find reminder #${cancel[1]} that belongs to you.` });
    return true;
  }

  if (/^\/?remind\b/i.test(value)) {
    const reminder = parseReminder(value);
    if (!reminder || reminder.invalid) {
      await say({ text: 'Use `remind me in 20m to check the project` or `remind me every 1h to take a break`. Minimum delay is 10 seconds; maximum is 365 days.' });
      return true;
    }
    addSlackReminder({
      slackUserId: userId,
      channelId,
      threadTs,
      reminderText: reminder.text,
      dueAt: reminder.dueAt,
      intervalMs: reminder.intervalMs
    });
    const when = new Date(reminder.dueAt).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'UTC' });
    await say({ text: `${reminder.intervalMs ? 'Repeating reminder' : 'Reminder'} set for ${when}: ${reminder.text}` });
    return true;
  }
  return false;
}

async function handleCodeCommand({ userId, channelId, sandboxThreadId, text, threadTs, say }) {
  const match = String(text || '').trim().match(/^run(?:\s+(python|javascript|typescript))?\s*:\s*([\s\S]+)$/i);
  if (!match) return false;
  try {
    const output = await executeSandboxCode(`${channelId}:${sandboxThreadId}`, userId, match[2], match[1] || 'python');
    const fence = String.fromCharCode(96).repeat(3);
    await say({ text: `${fence}${match[1] || 'python'}\n${output}\n${fence}`, ...(threadTs ? { thread_ts: threadTs } : {}) });
  } catch (err) {
    await say({ text: `Code execution failed: ${err.message}`, ...(threadTs ? { thread_ts: threadTs } : {}) });
  }
  return true;
}

async function handleDiagramCommand({ client, channelId, text, threadTs, say }) {
  const match = String(text || '').trim().match(/^diagram\s*:\s*([\s\S]+)$/i);
  if (!match) return false;
  try {
    const image = await renderMermaid(match[1]);
    await client.files.uploadV2({
      channel_id: channelId,
      file: image,
      filename: 'hacki-diagram.png',
      title: 'Mermaid diagram',
      initial_comment: 'Here’s your diagram.',
      ...(threadTs ? { thread_ts: threadTs } : {})
    });
  } catch (err) {
    await say({ text: `I couldn’t render that diagram: ${err.message}`, ...(threadTs ? { thread_ts: threadTs } : {}) });
  }
  return true;
}

async function handleGitHubCommand({ text, threadTs, say }) {
  const value = String(text || '').trim();
  const issues = value.match(/^github\s+issues\s*:\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\s*$/i);
  const repository = value.match(/^github\s*:\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\s*$/i);
  if (!issues && !repository) return false;
  try {
    const [, owner, repo] = issues || repository;
    if (issues) {
      const items = await getPublicGitHubIssues(owner, repo, 5);
      await say({ text: items.length
        ? `Open issues in ${owner}/${repo}:\n${items.map(item => `• <${item.url}|#${item.number} ${item.title}>`).join('\n')}`
        : `No open issues found in ${owner}/${repo}.`, ...(threadTs ? { thread_ts: threadTs } : {}) });
    } else {
      const item = await getPublicGitHubRepository(owner, repo);
      await say({ text: `*<${item.url}|${item.name}>*\n${item.description}\nLanguage: ${item.language} · ⭐ ${item.stars} · ${item.openIssues} open issues\nLast pushed: ${item.updatedAt || 'unknown'} · default branch: ${item.defaultBranch}`, ...(threadTs ? { thread_ts: threadTs } : {}) });
    }
  } catch (err) {
    await say({ text: `GitHub lookup failed: ${err.message}`, ...(threadTs ? { thread_ts: threadTs } : {}) });
  }
  return true;
}

async function handlePageFetchCommand({ text, threadTs, say }) {
  const match = String(text || '').trim().match(/^fetch\s*:\s*(\S+)\s*$/i);
  if (!match) return false;
  try {
    const page = await fetchWebPage(match[1]);
    const body = page.text.length > 2600 ? `${page.text.slice(0, 2600)}…` : page.text;
    await say({ text: `*<${page.url}|${page.title}>*\n${body}`, ...(threadTs ? { thread_ts: threadTs } : {}) });
  } catch (err) {
    await say({ text: `I couldn’t fetch that page: ${err.message}`, ...(threadTs ? { thread_ts: threadTs } : {}) });
  }
  return true;
}

async function handleChannelSearchCommand({ client, channelId, text, threadTs, say }) {
  const match = String(text || '').trim().match(/^search(?:\s+here)?\s*:\s*(.+)$/i);
  if (!match) return false;
  if (String(channelId || '').startsWith('D')) {
    await say({ text: 'Use `search here: words` in the channel you want me to search.', ...(threadTs ? { thread_ts: threadTs } : {}) });
    return true;
  }
  const terms = match[1].toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
  try {
    const history = await client.conversations.history({ channel: channelId, limit: 200 });
    const found = (history.messages || [])
      .filter(item => item.text && terms.every(term => item.text.toLowerCase().includes(term)))
      .slice(0, 5);
    if (!found.length) {
      await say({ text: `I couldn’t find a recent message matching “${match[1].slice(0, 100)}” in this channel.`, ...(threadTs ? { thread_ts: threadTs } : {}) });
      return true;
    }
    const links = await Promise.all(found.map(async item => {
      try {
        const result = await client.chat.getPermalink({ channel: channelId, message_ts: item.ts });
        return result.permalink;
      } catch { return null; }
    }));
    const lines = found.map((item, index) => {
      const excerpt = cleanMessageForContext(item.text).replace(/\n+/g, ' ').slice(0, 260)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const author = item.user ? `<@${item.user}>: ` : '';
      return `• ${links[index] ? `<${links[index]}|Open post>` : 'Post'} — ${author}${excerpt}`;
    });
    await say({ text: `Recent channel matches for “${match[1].slice(0, 100)}” (up to the latest 200 posts):\n${lines.join('\n')}`, ...(threadTs ? { thread_ts: threadTs } : {}) });
  } catch (err) {
    await say({ text: `I couldn’t read this channel’s history: ${err.data?.error || err.message}.`, ...(threadTs ? { thread_ts: threadTs } : {}) });
  }
  return true;
}

async function queueChannelPost({ userId, channelId, threadTs, messageText, say }) {
  if (!messageText || messageText.length > 2500) {
    await say({ text: 'Keep channel posts under 2500 characters.' });
    return false;
  }
  const token = randomBytes(12).toString('hex');
  pendingChannelPosts.set(token, {
    kind: 'post',
    userId,
    channelId,
    threadTs: threadTs || null,
    messageText,
    expiresAt: Date.now() + 5 * 60_000
  });
  await say({
    text: 'Review and confirm this channel post:',
    ...(threadTs ? { thread_ts: threadTs } : {}),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*Review this post before it is sent:*\n${messageText.replace(/<(!?(?:here|channel|everyone)|@[A-Z0-9]+)>/gi, value => value.replace('<', '&lt;').replace('>', '&gt;'))}` } },
      { type: 'actions', elements: [
        { type: 'button', action_id: 'hacki_confirm_channel_post', text: { type: 'plain_text', text: 'Post it' }, style: 'primary', value: token },
        { type: 'button', action_id: 'hacki_cancel_channel_post', text: { type: 'plain_text', text: 'Cancel' }, value: token }
      ] }
    ]
  });
  return true;
}

async function queueChannelCanvas({ userId, channelId, threadTs, title, markdown, say }) {
  const canvasTitle = String(title || '').trim().slice(0, 150);
  const content = String(markdown || '').trim();
  if (!canvasTitle || !content || content.length > 20_000) {
    await say({ text: 'Give the canvas a title and keep its content under 20,000 characters.', ...(threadTs ? { thread_ts: threadTs } : {}) });
    return false;
  }
  const token = randomBytes(12).toString('hex');
  pendingChannelPosts.set(token, {
    kind: 'canvas', userId, channelId, threadTs: threadTs || null,
    title: canvasTitle, markdown: content, expiresAt: Date.now() + 5 * 60_000
  });
  const preview = content.slice(0, 1800).replace(/<(!?(?:here|channel|everyone)|@[A-Z0-9]+)>/gi, value => value.replace('<', '&lt;').replace('>', '&gt;'));
  await say({
    text: 'Review and confirm this channel canvas:',
    ...(threadTs ? { thread_ts: threadTs } : {}),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*Canvas: ${canvasTitle}*\n${preview}${content.length > 1800 ? '\n…(preview shortened)' : ''}` } },
      { type: 'actions', elements: [
        { type: 'button', action_id: 'hacki_confirm_channel_post', text: { type: 'plain_text', text: 'Create canvas' }, style: 'primary', value: token },
        { type: 'button', action_id: 'hacki_cancel_channel_post', text: { type: 'plain_text', text: 'Cancel' }, value: token }
      ] }
    ]
  });
  return true;
}

async function queueChannelCreate({ userId, channelId, threadTs, name, isPrivate = false, say }) {
  const channelName = String(name || '').trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 80);
  if (!channelName || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(channelName)) {
    await say({ text: 'Give me a channel name using lowercase letters, numbers, hyphens, or underscores.', ...(threadTs ? { thread_ts: threadTs } : {}) });
    return false;
  }
  const token = randomBytes(12).toString('hex');
  pendingChannelPosts.set(token, {
    kind: 'channel_create', userId, channelId, threadTs: threadTs || null,
    channelName, isPrivate, expiresAt: Date.now() + 5 * 60_000
  });
  await say({
    text: 'Review and confirm this channel creation:',
    ...(threadTs ? { thread_ts: threadTs } : {}),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `Create the ${isPrivate ? 'private' : 'public'} channel *#${channelName}*?${isPrivate ? ' Only invited members will be able to access it.' : ' It will be visible to workspace members.'}` } },
      { type: 'actions', elements: [
        { type: 'button', action_id: 'hacki_confirm_channel_post', text: { type: 'plain_text', text: 'Create channel' }, style: 'primary', value: token },
        { type: 'button', action_id: 'hacki_cancel_channel_post', text: { type: 'plain_text', text: 'Cancel' }, value: token }
      ] }
    ]
  });
  return true;
}

async function queueSandboxFileUpload({ userId, channelId, threadTs, sandboxThreadKey, path: filePath, comment, say }) {
  const { filename, data } = await readSandboxFile(sandboxThreadKey, userId, filePath);
  const token = randomBytes(12).toString('hex');
  pendingChannelPosts.set(token, {
    kind: 'file_upload', userId, channelId, threadTs: threadTs || null,
    filename, data, comment: String(comment || '').trim().slice(0, 500), expiresAt: Date.now() + 5 * 60_000
  });
  await say({
    text: 'Review and confirm this file upload:', ...(threadTs ? { thread_ts: threadTs } : {}),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `Upload *${filename.replace(/[&<>]/g, '')}* to this conversation?${comment ? `\n${String(comment).slice(0, 500)}` : ''}` } },
      { type: 'actions', elements: [
        { type: 'button', action_id: 'hacki_confirm_channel_post', text: { type: 'plain_text', text: 'Upload file' }, style: 'primary', value: token },
        { type: 'button', action_id: 'hacki_cancel_channel_post', text: { type: 'plain_text', text: 'Cancel' }, value: token }
      ] }
    ]
  });
  return true;
}

async function queueSandboxSitePreview({ userId, channelId, threadTs, sandboxThreadKey, directory, say }) {
  const directoryPath = String(directory || '').trim();
  if (!directoryPath || directoryPath.length > 500 || directoryPath.includes('\0')) {
    await say({ text: 'Give a valid directory path from this thread’s sandbox.', ...(threadTs ? { thread_ts: threadTs } : {}) });
    return false;
  }
  const token = randomBytes(12).toString('hex');
  pendingChannelPosts.set(token, {
    kind: 'site_preview', userId, channelId, threadTs: threadTs || null,
    sandboxThreadKey, directory: directoryPath, expiresAt: Date.now() + 5 * 60_000
  });
  await say({
    text: 'Review and confirm this temporary public preview:', ...(threadTs ? { thread_ts: threadTs } : {}),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `Serve the sandbox directory *${directoryPath.replace(/[&<>]/g, '')}* at a temporary public URL? Anyone with the link can view it while this sandbox is running.` } },
      { type: 'actions', elements: [
        { type: 'button', action_id: 'hacki_confirm_channel_post', text: { type: 'plain_text', text: 'Start public preview' }, style: 'primary', value: token },
        { type: 'button', action_id: 'hacki_cancel_channel_post', text: { type: 'plain_text', text: 'Cancel' }, value: token }
      ] }
    ]
  });
  return true;
}

async function queueGitHubFileEdit({ userId, channelId, threadTs, owner, repo, path: filePath, content, commitMessage, say }) {
  const ownerName = String(owner || '').trim();
  if (!canEditGitHubFiles() || !config.githubAllowedOwners.includes(ownerName.toLowerCase()) || !config.githubAllowedSlackUsers.includes(userId)) {
    await say({ text: 'GitHub file edits are not enabled for your Slack account or that repository owner.', ...(threadTs ? { thread_ts: threadTs } : {}) });
    return false;
  }
  const proposedContent = String(content || '');
  const message = String(commitMessage || '').trim().slice(0, 180);
  if (!proposedContent.trim() || proposedContent.length > 100_000 || !message) {
    await say({ text: 'The edit needs a commit message and file content under 100,000 characters.', ...(threadTs ? { thread_ts: threadTs } : {}) });
    return false;
  }
  const currentFile = await getPublicGitHubFile(ownerName, repo, filePath);
  if (currentFile.size > 100_000) {
    await say({ text: 'Hacki only prepares edits for text files up to 100,000 bytes.', ...(threadTs ? { thread_ts: threadTs } : {}) });
    return false;
  }
  const token = randomBytes(12).toString('hex');
  pendingChannelPosts.set(token, {
    kind: 'github_file_edit', userId, channelId, threadTs: threadTs || null,
    owner: ownerName, repo, path: currentFile.path, expectedSha: currentFile.sha,
    content: proposedContent, commitMessage: message, expiresAt: Date.now() + 5 * 60_000
  });
  const preview = proposedContent.slice(0, 1600).replace(/```/g, '` ` `');
  const displayPath = currentFile.path.replace(/[&<>`]/g, '');
  const displayMessage = message.replace(/[&<>]/g, '');
  await say({
    text: 'Review and confirm this GitHub file edit:', ...(threadTs ? { thread_ts: threadTs } : {}),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*Commit to <https://github.com/${ownerName}/${repo}|${ownerName}/${repo}>?*\nFile: \`${displayPath}\`\nCommit: ${displayMessage}\n\n\`\`\`\n${preview}${proposedContent.length > 1600 ? '\n…(preview shortened)' : ''}\n\`\`\`` } },
      { type: 'actions', elements: [
        { type: 'button', action_id: 'hacki_confirm_channel_post', text: { type: 'plain_text', text: 'Commit edit' }, style: 'primary', value: token },
        { type: 'button', action_id: 'hacki_cancel_channel_post', text: { type: 'plain_text', text: 'Cancel' }, value: token }
      ] }
    ]
  });
  return true;
}

async function handleChannelActionCommand({ client, userId, channelId, text, threadTs, say }) {
  const value = String(text || '').trim();
  const react = value.match(/^react\s*:\s*:?(\w[\w+-]*):?\s*$/i);
  if (react) {
    if (!threadTs) {
      await say({ text: 'Reply in a thread if you want me to react to its parent message.' });
      return true;
    }
    try {
      await client.reactions.add({ channel: channelId, timestamp: threadTs, name: react[1] });
      await say({ text: `Added :${react[1]}: to the thread’s parent message.`, thread_ts: threadTs });
    } catch (err) {
      await say({ text: `I couldn’t add that reaction: ${err.data?.error || err.message}`, thread_ts: threadTs });
    }
    return true;
  }

  const post = value.match(/^post\s*:\s*([\s\S]+)$/i);
  const poll = value.match(/^poll\s*:\s*([^|]+)\|\s*([^|]+\|[^|]+(?:\|[^|]+)*)$/i);
  if (!post && !poll) return false;
  let messageText = post?.[1]?.trim();
  if (poll) {
    const options = poll[2].split('|').map(option => option.trim()).filter(Boolean).slice(0, 6);
    if (options.length < 2) {
      await say({ text: 'A poll needs a question and at least two options, separated with `|`.' });
      return true;
    }
    const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
    messageText = `*Poll: ${poll[1].trim()}*\n${options.map((option, index) => `${emoji[index]} ${option}`).join('\n')}\n\nReact to vote.`;
  }
  await queueChannelPost({ userId, channelId, threadTs, messageText, say });
  return true;
}

async function handleEmailCommand({ userId, channelId, text, say, isDM }) {
  const value = String(text || '').trim();
  if (!/^email\s*:/i.test(value)) return false;
  if (!isDM || !String(channelId || '').startsWith('D')) {
    await say({ text: 'Email requests are only available in a one-to-one DM with Hacki.' });
    return true;
  }
  const match = value.match(/^email\s*:\s*([^|\s]+)\s*\|\s*([^|\r\n]+)\s*\|\s*([\s\S]+)$/i);
  if (!match) {
    await say({ text: 'Use `email: person@example.com | Subject | Message body` in a DM.' });
    return true;
  }
  if (!isEmailConfigured()) {
    await say({ text: 'Email sending is not configured. The server needs SMTP_URL and MAIL_FROM.' });
    return true;
  }
  const [, to, subject, body] = match;
  if (to.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || subject.trim().length > 200 || body.length > 10_000) {
    await say({ text: 'Please provide a valid recipient, a subject under 200 characters, and a body under 10,000 characters.' });
    return true;
  }
  const token = randomBytes(12).toString('hex');
  pendingEmailSends.set(token, { userId, channelId, to, subject: subject.trim(), body: body.trim(), expiresAt: Date.now() + 5 * 60_000 });
  await say({
    text: `Review this email to ${to}. It will only send after you confirm.`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*To:* ${to}\n*Subject:* ${subject.trim()}\n\n${body.trim()}` } },
      { type: 'actions', elements: [
        { type: 'button', action_id: 'hacki_confirm_email', text: { type: 'plain_text', text: 'Send email' }, style: 'primary', value: token },
        { type: 'button', action_id: 'hacki_cancel_email', text: { type: 'plain_text', text: 'Cancel' }, value: token }
      ] }
    ]
  });
  return true;
}

async function deliverDueReminders(client) {
  for (const reminder of getDueSlackReminders(Date.now(), 20)) {
    const id = Number(reminder.id);
    if (pendingReminderIds.has(id)) continue;
    pendingReminderIds.add(id);
    try {
      let reminderText = reminder.reminder_text;
      const scheduledCode = reminderText.match(/^run(?:\s+(python|javascript|typescript))?\s*:\s*([\s\S]+)$/i);
      const scheduledQuestion = reminderText.match(/^ask(?:\s+hacki)?\s*:\s*([\s\S]+)$/i);
      if (scheduledCode) {
        try {
          const output = await executeSandboxCode(
            `${reminder.channel_id}:${reminder.thread_ts || `reminder-${id}`}`,
            reminder.slack_user_id,
            scheduledCode[2],
            scheduledCode[1] || 'python'
          );
          reminderText = `Scheduled code run:\n${String(output).slice(0, 1800)}`;
        } catch (err) {
          reminderText = `Scheduled code could not run: ${err.message}`;
        }
      } else if (scheduledQuestion) {
        const result = await askHacki(scheduledQuestion[1], [], {
          slackUserId: reminder.slack_user_id,
          sandboxThreadKey: `${reminder.channel_id}:${reminder.thread_ts || `reminder-${id}`}`,
          client,
          channelId: reminder.channel_id
        });
        reminderText = `Scheduled answer:\n${formatForSlack(result.answer, result.sources)}`;
      }
      await client.chat.postMessage({
        channel: reminder.channel_id,
        ...(reminder.thread_ts ? { thread_ts: reminder.thread_ts } : {}),
        text: `<@${reminder.slack_user_id}> ⏰ Reminder: ${reminderText}`
      });
      if (reminder.interval_ms) {
        let nextDueAt = Number(reminder.due_at) + Number(reminder.interval_ms);
        while (nextDueAt <= Date.now()) nextDueAt += Number(reminder.interval_ms);
        completeSlackReminder(id, Number(reminder.interval_ms), nextDueAt);
      } else {
        completeSlackReminder(id);
      }
    } catch (err) {
      console.warn(`[SlackBot] Could not deliver reminder ${id}: ${err.data?.error || err.message}`);
    } finally {
      pendingReminderIds.delete(id);
    }
  }
}

function buildAppHomeView(userId) {
  const instructions = getSlackInstructions(userId);
  const modelOverride = getUserModelOverrideSummary(userId);
  const mcpServers = listSlackMcpServerSummaries(userId);
  const modelBlocks = canEncryptUserModelKeys() ? [
    { type: 'section', text: { type: 'mrkdwn', text: modelOverride ? `*Your model key*\n${modelOverride.provider} · ${modelOverride.model}\nYour key is stored encrypted and used only for your Slack requests.` : '_Use an API key from a supported provider for your Slack requests._' } },
    { type: 'actions', elements: [
      { type: 'button', action_id: 'hacki_home_model_override', text: { type: 'plain_text', text: modelOverride ? 'Update model key' : 'Add model key' }, value: 'edit' },
      ...(modelOverride ? [{ type: 'button', action_id: 'hacki_home_clear_model_override', text: { type: 'plain_text', text: 'Remove model key' }, style: 'danger', value: 'clear' }] : [])
    ] }
  ] : modelOverride ? [
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Your saved model key cannot be used until the operator restores SLACK_USER_SECRETS_ENCRYPTION_KEY (or its legacy alias).' }] },
    { type: 'actions', elements: [{ type: 'button', action_id: 'hacki_home_clear_model_override', text: { type: 'plain_text', text: 'Remove saved model key' }, style: 'danger', value: 'clear' }] }
  ] : [{ type: 'context', elements: [{ type: 'mrkdwn', text: 'Encrypted per-user settings are disabled until SLACK_USER_SECRETS_ENCRYPTION_KEY is configured by the operator.' }] }];
  const mcpBlocks = canEncryptUserModelKeys() ? [
    { type: 'section', text: { type: 'mrkdwn', text: `*Your MCP servers*\n${mcpServers.length ? mcpServers.map(server => `• *${server.name}* — ${server.endpoint}`).join('\n') : '_No remote MCP servers configured._'}\nMCP tools and results are sent to each server you configure.` } },
    ...mcpServers.map(server => ({ type: 'actions', elements: [{
      type: 'button', action_id: 'hacki_home_mcp_remove', text: { type: 'plain_text', text: `Remove ${server.name}` }, style: 'danger', value: server.serverId
    }] })),
    ...(mcpServers.length < 5 ? [{ type: 'actions', elements: [{
      type: 'button', action_id: 'hacki_home_mcp_add', text: { type: 'plain_text', text: 'Add MCP server' }, value: 'add'
    }] }] : [])
  ] : [{ type: 'context', elements: [{ type: 'mrkdwn', text: 'MCP servers are disabled until SLACK_USER_SECRETS_ENCRYPTION_KEY is configured.' }] }];
  return {
    type: 'home',
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'Hacki settings' } },
      { type: 'section', text: { type: 'mrkdwn', text: 'Hacki can answer Hack Club questions, search web and channel sources, use your own model key, run code in an E2B sandbox, render Mermaid diagrams, set reminders, and prepare confirmed channel, post, poll, canvas, and email actions.' } },
      ...modelBlocks,
      ...mcpBlocks,
      { type: 'section', text: { type: 'mrkdwn', text: instructions ? `*Your custom DM instructions*\n${instructions}` : '_You have no custom DM instructions yet._' } },
      { type: 'actions', elements: [
        { type: 'button', action_id: 'hacki_home_edit_instructions', text: { type: 'plain_text', text: 'Edit instructions' }, value: 'edit' },
        { type: 'button', action_id: 'hacki_home_erase_data', text: { type: 'plain_text', text: 'Erase my data' }, style: 'danger', value: 'erase' }
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'Memories, custom instructions, reminders, and sandbox references are stored for your Slack account. Erasing data does not remove Slack messages.' }] }
    ]
  };
}

export async function initSlackBot() {
  if (!config.enableSlackBot || !config.slackBotToken || !config.slackAppToken) {
    console.log('[SlackBot] Slack bot listener disabled (tokens not provided or ENABLE_SLACK_BOT=false).');
    return null;
  }

  try {
    botApp = new App({
      token: config.slackBotToken,
      appToken: config.slackAppToken,
      socketMode: true,
      logger: botLogger,
      clientOptions: {
        logger: botLogger
      }
    });
    const auth = await botApp.client.auth.test();
    botUserId = auth.user_id;
    botTeamId = auth.team_id;

    // If another bot invites Hacki into a channel, leave immediately. Slack
    // includes the inviter on member_joined_channel events for invitations.
    botApp.event('member_joined_channel', async ({ event, client }) => {
      if (event?.user !== botUserId || !event?.channel || !event?.inviter) return;
      try {
        const inviterInfo = await client.users.info({ user: event.inviter });
        if (!inviterInfo.user?.is_bot && !inviterInfo.user?.is_app_user) return;
        await client.conversations.leave({ channel: event.channel });
        console.log(`[SlackBot] Left channel ${event.channel}; invited by bot ${event.inviter}.`);
      } catch (err) {
        const code = err.data?.error || err.message;
        console.warn(`[SlackBot] Could not check bot inviter or leave channel ${event.channel}: ${code}`);
      }
    });

    // The collector uses a Web API client for scheduled syncing. Register
    // channel creation on this running Socket Mode app so matching new public
    // channels are joined immediately.
    botApp.event('channel_created', async ({ event, client }) => {
      await autoJoinMatchingChannel(event.channel, client);
    });

    botApp.event('app_home_opened', async ({ event, client }) => {
      if (event.tab !== 'home' || !event.user) return;
      try {
        await client.views.publish({ user_id: event.user, view: buildAppHomeView(event.user) });
      } catch (err) {
        console.warn(`[SlackBot] Could not publish App Home for ${event.user}: ${err.data?.error || err.message}`);
      }
    });

    botApp.action('hacki_home_model_override', async ({ ack, body, client }) => {
      await ack();
      const current = getUserModelOverrideSummary(body.user.id);
      const providers = Object.entries(SLACK_MODEL_PROVIDERS).map(([value, provider]) => ({
        text: { type: 'plain_text', text: provider.name }, value
      }));
      const currentProvider = Object.entries(SLACK_MODEL_PROVIDERS).find(([key, provider]) => key === current?.provider || provider.name === current?.provider)?.[0] || 'openai';
      try {
        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: 'modal', callback_id: 'hacki_save_model_override',
            title: { type: 'plain_text', text: 'Your model key' },
            submit: { type: 'plain_text', text: 'Save key' },
            close: { type: 'plain_text', text: 'Cancel' },
            blocks: [
              { type: 'input', block_id: 'provider_block', label: { type: 'plain_text', text: 'Provider' }, element: {
                type: 'static_select', action_id: 'provider_input', options: providers,
                initial_option: providers.find(option => option.value === currentProvider)
              } },
              { type: 'input', block_id: 'model_block', label: { type: 'plain_text', text: 'Model ID' }, element: {
                type: 'plain_text_input', action_id: 'model_input', max_length: 180,
                initial_value: current?.model || 'gpt-4o-mini'
              } },
              { type: 'input', block_id: 'api_key_block', label: { type: 'plain_text', text: 'Provider API key' }, hint: { type: 'plain_text', text: 'Sent only to the provider you select. Hacki does not fall back to its shared key when this override is set.' }, element: {
                type: 'plain_text_input', action_id: 'api_key_input', max_length: 500,
                placeholder: { type: 'plain_text', text: 'Paste your API key' }
              } }
            ]
          }
        });
      } catch (err) {
        console.warn(`[SlackBot] Could not open model settings: ${err.data?.error || err.message}`);
      }
    });

    botApp.view('hacki_save_model_override', async ({ ack, body, view, client }) => {
      const provider = view.state.values.provider_block.provider_input.selected_option?.value;
      const model = view.state.values.model_block.model_input.value || '';
      const apiKey = view.state.values.api_key_block.api_key_input.value || '';
      if (!provider || !model.trim() || !apiKey.trim()) {
        await ack({ response_action: 'errors', errors: {
          ...(!provider ? { provider_block: 'Choose a provider.' } : {}),
          ...(!model.trim() ? { model_block: 'Enter a model ID.' } : {}),
          ...(!apiKey.trim() ? { api_key_block: 'Enter an API key.' } : {})
        } });
        return;
      }
      try {
        saveUserModelOverride(body.user.id, { provider, model, apiKey });
        await ack();
        client.views.publish({ user_id: body.user.id, view: buildAppHomeView(body.user.id) })
          .catch(err => console.warn(`[SlackBot] Could not refresh App Home: ${err.data?.error || err.message}`));
      } catch (err) {
        await ack({ response_action: 'errors', errors: { api_key_block: err.message } });
      }
    });

    botApp.action('hacki_home_clear_model_override', async ({ ack, body, client }) => {
      await ack();
      clearUserModelOverride(body.user.id);
      await client.views.publish({ user_id: body.user.id, view: buildAppHomeView(body.user.id) });
    });

    botApp.action('hacki_home_mcp_add', async ({ ack, body, client }) => {
      await ack();
      try {
        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: 'modal', callback_id: 'hacki_save_mcp_server',
            title: { type: 'plain_text', text: 'Add MCP server' },
            submit: { type: 'plain_text', text: 'Connect' },
            close: { type: 'plain_text', text: 'Cancel' },
            blocks: [
              { type: 'input', block_id: 'mcp_name_block', label: { type: 'plain_text', text: 'Server name' }, element: {
                type: 'plain_text_input', action_id: 'mcp_name_input', max_length: 32,
                placeholder: { type: 'plain_text', text: 'for example, project-tools' }
              } },
              { type: 'input', block_id: 'mcp_endpoint_block', label: { type: 'plain_text', text: 'Streamable HTTP endpoint' }, element: {
                type: 'plain_text_input', action_id: 'mcp_endpoint_input', max_length: 500,
                placeholder: { type: 'plain_text', text: 'https://mcp.example.com/mcp' }
              } },
              { type: 'input', block_id: 'mcp_token_block', label: { type: 'plain_text', text: 'Bearer token (optional)' }, optional: true, hint: {
                type: 'plain_text', text: 'The token is encrypted at rest and sent only to this server.'
              }, element: {
                type: 'plain_text_input', action_id: 'mcp_token_input', max_length: 1000,
                placeholder: { type: 'plain_text', text: 'Paste a bearer token if this server requires one' }
              } }
            ]
          }
        });
      } catch (err) {
        console.warn(`[SlackBot] Could not open MCP settings: ${err.data?.error || err.message}`);
      }
    });

    botApp.view('hacki_save_mcp_server', async ({ ack, body, view, client }) => {
      const name = view.state.values.mcp_name_block.mcp_name_input.value || '';
      const endpoint = view.state.values.mcp_endpoint_block.mcp_endpoint_input.value || '';
      const bearerToken = view.state.values.mcp_token_block.mcp_token_input.value || '';
      if (!name.trim() || !endpoint.trim()) {
        await ack({ response_action: 'errors', errors: {
          ...(!name.trim() ? { mcp_name_block: 'Enter a server name.' } : {}),
          ...(!endpoint.trim() ? { mcp_endpoint_block: 'Enter an HTTPS MCP endpoint.' } : {})
        } });
        return;
      }
      try {
        await saveUserMcpServer(body.user.id, { name, endpoint, bearerToken });
        await ack();
        client.views.publish({ user_id: body.user.id, view: buildAppHomeView(body.user.id) })
          .catch(err => console.warn(`[SlackBot] Could not refresh App Home: ${err.data?.error || err.message}`));
      } catch (err) {
        await ack({ response_action: 'errors', errors: { mcp_endpoint_block: err.message } });
      }
    });

    botApp.action('hacki_home_mcp_remove', async ({ ack, body, action, client }) => {
      await ack();
      removeUserMcpServer(body.user.id, action.value);
      await client.views.publish({ user_id: body.user.id, view: buildAppHomeView(body.user.id) });
    });

    botApp.action('hacki_home_edit_instructions', async ({ ack, body, client }) => {
      await ack();
      try {
        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'hacki_save_instructions',
            title: { type: 'plain_text', text: 'Hacki instructions' },
            submit: { type: 'plain_text', text: 'Save' },
            close: { type: 'plain_text', text: 'Cancel' },
            blocks: [{
              type: 'input',
              block_id: 'instructions_block',
              label: { type: 'plain_text', text: 'Custom DM instructions' },
              optional: true,
              element: {
                type: 'plain_text_input',
                action_id: 'instructions_input',
                multiline: true,
                max_length: 1500,
                initial_value: getSlackInstructions(body.user.id)
              }
            }]
          }
        });
      } catch (err) {
        console.warn(`[SlackBot] Could not open settings modal: ${err.data?.error || err.message}`);
      }
    });

    botApp.view('hacki_save_instructions', async ({ ack, body, view, client }) => {
      const instructions = view.state.values.instructions_block.instructions_input.value || '';
      if (instructions.trim()) setSlackInstructions(body.user.id, instructions);
      else deleteSlackInstructions(body.user.id);
      await ack();
      client.views.publish({ user_id: body.user.id, view: buildAppHomeView(body.user.id) })
        .catch(err => console.warn(`[SlackBot] Could not refresh App Home: ${err.data?.error || err.message}`));
    });

    botApp.action('hacki_home_erase_data', async ({ ack, body, client }) => {
      await ack();
      try {
        await client.views.open({
          trigger_id: body.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'hacki_confirm_erase_data',
            title: { type: 'plain_text', text: 'Erase Hacki data?' },
            submit: { type: 'plain_text', text: 'Erase data' },
            close: { type: 'plain_text', text: 'Cancel' },
            blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'This clears your Hacki memories, custom instructions, reminders, and saved E2B sessions. It cannot remove Slack messages.' } }]
          }
        });
      } catch (err) {
        console.warn(`[SlackBot] Could not open erase confirmation: ${err.data?.error || err.message}`);
      }
    });

    botApp.view('hacki_confirm_erase_data', async ({ ack, body, client }) => {
      await ack();
      clearDMHistoryForUser(body.user.id);
      (async () => {
        try {
          await removeUserSandboxes(body.user.id);
        } catch (err) {
          console.warn(`[HackiSandbox] Cleanup warning during erase: ${err.message}`);
        }
        eraseSlackUserData(body.user.id);
        await client.views.publish({ user_id: body.user.id, view: buildAppHomeView(body.user.id) });
      })().catch(err => console.warn(`[SlackBot] Could not finish App Home data erasure: ${err.message}`));
    });

    botApp.action('hacki_confirm_channel_post', async ({ ack, body, action, client }) => {
      await ack();
      const pending = pendingChannelPosts.get(action.value);
      if (!pending || pending.expiresAt < Date.now()) {
        pendingChannelPosts.delete(action.value);
        if (body.channel?.id) await client.chat.postEphemeral({ channel: body.channel.id, user: body.user.id, text: 'That confirmation expired. Ask Hacki to prepare the action again.' });
        return;
      }
      if (body.user.id !== pending.userId) {
        await client.chat.postEphemeral({ channel: pending.channelId, user: body.user.id, text: 'Only the person who requested this post can confirm it.' });
        return;
      }
      pendingChannelPosts.delete(action.value);
      let completionText;
      try {
        if (pending.kind === 'channel_create') {
          const created = await client.conversations.create({ name: pending.channelName, is_private: Boolean(pending.isPrivate) });
          if (!created.channel?.id) throw new Error('Slack did not return the new channel ID.');
          if (pending.isPrivate) {
            try {
              await client.conversations.invite({ channel: created.channel.id, users: pending.userId });
              completionText = `Created private channel <#${created.channel.id}> and invited you.`;
            } catch (inviteError) {
              completionText = `Created private channel <#${created.channel.id}>, but Slack could not invite you: ${inviteError.data?.error || inviteError.message}.`;
            }
          } else {
            completionText = `Created public channel <#${created.channel.id}>.`;
          }
        } else if (pending.kind === 'file_upload') {
          await client.files.uploadV2({
            channel_id: pending.channelId,
            ...(pending.threadTs ? { thread_ts: pending.threadTs } : {}),
            file: pending.data,
            filename: pending.filename,
            title: pending.filename,
            ...(pending.comment ? { initial_comment: pending.comment } : {})
          });
          completionText = `Uploaded ${pending.filename}.`;
        } else if (pending.kind === 'site_preview') {
          const url = await startSandboxStaticPreview(pending.sandboxThreadKey, pending.userId, pending.directory);
          completionText = `Temporary public preview is live: <${url}|Open site>. It remains available while this E2B sandbox is running.`;
        } else if (pending.kind === 'github_file_edit') {
          const committed = await commitGitHubFileEdit({
            owner: pending.owner, repo: pending.repo, path: pending.path, content: pending.content,
            message: pending.commitMessage, expectedSha: pending.expectedSha, slackUserId: pending.userId
          });
          completionText = `GitHub edit committed: <${committed.url}|${pending.owner}/${pending.repo}/${pending.path}>.`;
        } else if (pending.kind === 'canvas') {
          let canvasId;
          try {
            const created = await client.conversations.canvases.create({
              channel_id: pending.channelId,
              title: pending.title,
              document_content: { type: 'markdown', markdown: pending.markdown }
            });
            canvasId = created.canvas_id;
          } catch (createError) {
            const errorCode = createError.data?.error;
            if (!['channel_canvas_already_exists', 'free_team_canvas_tab_already_exists'].includes(errorCode)) throw createError;
            const info = await client.conversations.info({ channel: pending.channelId });
            canvasId = info.channel?.properties?.canvas?.file_id;
            if (!canvasId) throw createError;
            await client.canvases.edit({
              canvas_id: canvasId,
              changes: [{ operation: 'insert_at_end', document_content: { type: 'markdown', markdown: `\n\n# ${pending.title}\n\n${pending.markdown}` } }]
            });
          }
          const link = botTeamId && canvasId ? `https://app.slack.com/docs/${botTeamId}/${canvasId}` : null;
          completionText = `${link ? `<${link}|Canvas ready>` : 'Canvas ready'}: ${pending.title}. Open it from this channel’s canvas tab.`;
        } else {
          await client.chat.postMessage({
            channel: pending.channelId,
            ...(pending.threadTs ? { thread_ts: pending.threadTs } : {}),
            text: pending.messageText
          });
          completionText = 'Post sent.';
        }
      } catch (err) {
        const label = pending.kind === 'canvas' ? 'Canvas creation failed' : pending.kind === 'channel_create' ? 'Channel creation failed' : pending.kind === 'file_upload' ? 'File upload failed' : pending.kind === 'site_preview' ? 'Preview failed' : pending.kind === 'github_file_edit' ? 'GitHub edit failed' : 'Post failed';
        const errorText = `${label}: ${err.data?.error || err.message}`;
        if (body.message?.ts) await client.chat.update({ channel: pending.channelId, ts: body.message.ts, text: errorText, blocks: [] });
        else await client.chat.postEphemeral({ channel: pending.channelId, user: body.user.id, text: errorText });
        return;
      }
      if (body.message?.ts) {
        try {
          await client.chat.update({ channel: pending.channelId, ts: body.message.ts, text: completionText, blocks: [] });
        } catch (err) {
          console.warn(`[SlackBot] Action succeeded, but its confirmation card could not be updated: ${err.data?.error || err.message}`);
          await client.chat.postEphemeral({ channel: pending.channelId, user: body.user.id, text: completionText });
        }
      }
    });

    botApp.action('hacki_cancel_channel_post', async ({ ack, body, action, client }) => {
      await ack();
      const pending = pendingChannelPosts.get(action.value);
      if (!pending || body.user.id !== pending.userId) {
        if (body.channel?.id) await client.chat.postEphemeral({ channel: body.channel.id, user: body.user.id, text: 'That post can’t be cancelled from this account.' });
        return;
      }
      pendingChannelPosts.delete(action.value);
      if (body.message?.ts) {
        const text = pending.kind === 'canvas' ? 'Canvas request cancelled.' : pending.kind === 'channel_create' ? 'Channel creation cancelled.' : 'Post cancelled.';
        await client.chat.update({ channel: pending.channelId, ts: body.message.ts, text, blocks: [] });
      }
    });

    botApp.action('hacki_confirm_email', async ({ ack, body, action, client }) => {
      await ack();
      const pending = pendingEmailSends.get(action.value);
      if (!pending || pending.expiresAt < Date.now() || body.user.id !== pending.userId) {
        pendingEmailSends.delete(action.value);
        if (body.message?.ts && body.channel?.id) await client.chat.update({ channel: body.channel.id, ts: body.message.ts, text: 'Email confirmation expired or is no longer valid.', blocks: [] });
        return;
      }
      const recent = (emailSendHistory.get(pending.userId) || []).filter(timestamp => Date.now() - timestamp < 60 * 60_000);
      if (recent.length >= 3) {
        await client.chat.postMessage({ channel: pending.channelId, text: 'Email limit reached: you can send up to three emails per hour through Hacki.' });
        return;
      }
      pendingEmailSends.delete(action.value);
      emailSendHistory.set(pending.userId, [...recent, Date.now()]);
      try {
        await sendEmail({ to: pending.to, subject: pending.subject, text: pending.body });
        if (body.message?.ts) await client.chat.update({ channel: pending.channelId, ts: body.message.ts, text: `Email sent to ${pending.to}.`, blocks: [] });
      } catch (err) {
        console.warn(`[SlackBot] Email send failed: ${err.message}`);
        if (body.message?.ts) await client.chat.update({ channel: pending.channelId, ts: body.message.ts, text: `Email wasn’t sent: ${err.message}`, blocks: [] });
      }
    });

    botApp.action('hacki_cancel_email', async ({ ack, body, action, client }) => {
      await ack();
      const pending = pendingEmailSends.get(action.value);
      if (!pending || body.user.id !== pending.userId) return;
      pendingEmailSends.delete(action.value);
      if (body.message?.ts) await client.chat.update({ channel: pending.channelId, ts: body.message.ts, text: 'Email cancelled.', blocks: [] });
    });

    // Only a human's active interaction can trigger a silent #hacki invite.

    // 1. Listen for mentions (@Hacki what is the newest YSWS?)
    botApp.event('app_mention', async ({ event, say, client, body }) => {
      if (event.bot_id || event.subtype === 'bot_message') return;
      if (!getUserBySlackId(event.user) && !isAuthVerificationHelpRequest(event.text)) {
        await say({ text: verificationPrompt(), thread_ts: event.thread_ts || event.ts });
        return;
      }
      console.log(`[SlackBot] Received mention in #${event.channel} from ${event.user}`);
      const mentionEventKey = body?.event_id || `${event.channel}:${event.ts}:${event.user || ''}`;
      let channelName = null;
      try {
        const channelInfo = await client.conversations.info({ channel: event.channel });
        channelName = channelInfo.channel?.name || null;
      } catch (err) {
        console.warn(`[SlackBot] Could not resolve mention channel ${event.channel}: ${err.data?.error || err.message}`);
      }
      recordSlackMention({
        eventKey: mentionEventKey,
        channelId: event.channel,
        channelName,
        userId: event.user,
        messageText: event.text || '',
        occurredAt: Math.floor(Number(event.ts)) || Math.floor(Date.now() / 1000),
        slackTs: event.ts
      });
      try {
        const cleanPrompt = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
        const replyInThread = payload => say({ ...payload, thread_ts: event.thread_ts || event.ts });
        if (await handleChannelSearchCommand({ client: botApp.client, channelId: event.channel, text: cleanPrompt, threadTs: event.thread_ts || event.ts, say: replyInThread })) return;
        if (await handlePageFetchCommand({ text: cleanPrompt, threadTs: event.thread_ts || event.ts, say: replyInThread })) return;
        if (await handleGitHubCommand({ text: cleanPrompt, threadTs: event.thread_ts || event.ts, say: replyInThread })) return;
        if (await handleChannelActionCommand({
          client: botApp.client,
          userId: event.user,
          channelId: event.channel,
          text: cleanPrompt,
          threadTs: event.thread_ts || event.ts,
          say: replyInThread
        })) return;
        if (await handleDiagramCommand({
          client: botApp.client,
          channelId: event.channel,
          text: cleanPrompt,
          threadTs: event.thread_ts || event.ts,
          say: replyInThread
        })) return;
        if (await handleCodeCommand({
          userId: event.user,
          channelId: event.channel,
          sandboxThreadId: event.thread_ts || event.ts,
          text: cleanPrompt,
          threadTs: event.thread_ts || event.ts,
          say: replyInThread
        })) return;
        if (await handleSlackUtilityCommand({
          userId: event.user,
          channelId: event.channel,
          text: cleanPrompt,
          threadTs: event.thread_ts || event.ts,
          isDM: false,
          say: replyInThread
        })) return;

        if (event.user) {
          autoAddUserToHackiChannel({ slackId: event.user }).catch(err => {
            console.warn('[SlackBot] Could not auto-add mention author to #hacki:', err.message);
          });
        }

        // Strip the bot mention tag
        const threadHistory = await getSlackThreadHistory(botApp.client, event);
        const currentChannel = await getCurrentChannelContext(botApp.client, event.channel);
        const responseStream = createSlackResponseStreamer({
          client: botApp.client,
          channelId: event.channel,
          threadTs: event.thread_ts || event.ts,
          userId: event.user
        });
        const response = await askHacki(cleanPrompt, threadHistory, {
          slackUserId: event.user,
          sandboxThreadKey: `${event.channel}:${event.thread_ts || event.ts}`,
          client: botApp.client,
          channelId: event.channel,
          currentChannel,
          targetMessageTs: event.thread_ts || event.ts,
          onTextDelta: delta => responseStream.append(delta),
          onProviderFailure: (providerName, hasFallback) => responseStream.providerFailed(providerName, hasFallback),
          onStreamComplete: sources => responseStream.finish(sources),
          prepareChannelPost: messageText => queueChannelPost({
            userId: event.user,
            channelId: event.channel,
            threadTs: event.thread_ts || event.ts,
            messageText,
            say: replyInThread
          }),
          prepareChannelCanvas: request => queueChannelCanvas({
            userId: event.user,
            channelId: event.channel,
            threadTs: event.thread_ts || event.ts,
            ...request,
            say: replyInThread
          }),
          prepareChannelCreate: (name, isPrivate) => queueChannelCreate({
            userId: event.user,
            channelId: event.channel,
            threadTs: event.thread_ts || event.ts,
            name,
            isPrivate,
            say: replyInThread
          }),
          prepareSandboxFileUpload: ({ path, comment }) => queueSandboxFileUpload({
            userId: event.user,
            channelId: event.channel,
            threadTs: event.thread_ts || event.ts,
            sandboxThreadKey: `${event.channel}:${event.thread_ts || event.ts}`,
            path,
            comment,
            say: replyInThread
          }),
          prepareSandboxSitePreview: directory => queueSandboxSitePreview({
            userId: event.user,
            channelId: event.channel,
            threadTs: event.thread_ts || event.ts,
            sandboxThreadKey: `${event.channel}:${event.thread_ts || event.ts}`,
            directory,
            say: replyInThread
          }),
          prepareGitHubFileEdit: request => queueGitHubFileEdit({
            userId: event.user, channelId: event.channel, threadTs: event.thread_ts || event.ts, ...request, say: replyInThread
          })
        });

        if (isClarificationReply(response.answer)) {
          recordSlackClarification(mentionEventKey, response.answer);
        }

        if (!response.streamed) {
          await say({
            text: formatForSlack(response.answer, response.sources),
            // A mention inside an existing thread belongs to that root. A
            // top-level mention starts a new thread rooted at the mention.
            thread_ts: event.thread_ts || event.ts
          });
        }
      } catch (err) {
        console.error('[SlackBot] Error replying to mention:', err.message);
        await say({
          text: "Oops! I ran into an issue finding that answer. Check `https://hackclub.com/team` or `https://ysws.hackclub.com/` in the meantime!",
          thread_ts: event.ts
        });
      }
    });

    // 4. Listen for direct messages (DMs) & conversation messages
    botApp.message(async ({ message, say }) => {
      if (!message || !message.text) return;
      // Ignore bot messages to avoid loops
      if (message.bot_id || message.subtype === 'bot_message') return;

      const isDM = message.channel_type === 'im' || 
                   message.channel_type === 'mpim' || 
                   (typeof message.channel === 'string' && message.channel.startsWith('D'));
      const isOneToOneDM = message.channel_type === 'im' || (typeof message.channel === 'string' && message.channel.startsWith('D'));

      if (isDM) {
        if (!getUserBySlackId(message.user) && !isAuthVerificationHelpRequest(message.text)) {
          await say({ text: verificationPrompt() });
          return;
        }
        console.log(`[SlackBot] Received DM from ${message.user}: "${message.text}"`);
        try {
          if (await handleEmailCommand({
            userId: message.user,
            channelId: message.channel,
            text: message.text,
            say,
            isDM: isOneToOneDM
          })) return;
          if (await handlePageFetchCommand({ text: message.text, threadTs: message.thread_ts, say })) return;
          if (await handleGitHubCommand({ text: message.text, threadTs: message.thread_ts, say })) return;
          if (await handleDiagramCommand({
            client: botApp.client,
            channelId: message.channel,
            text: message.text,
            threadTs: message.thread_ts,
            say
          })) return;
          if (await handleCodeCommand({
            userId: message.user,
            channelId: message.channel,
            sandboxThreadId: message.thread_ts || 'dm',
            text: message.text,
            threadTs: message.thread_ts,
            say
          })) return;
          if (await handleSlackUtilityCommand({
            userId: message.user,
            channelId: message.channel,
            text: message.text,
            threadTs: message.thread_ts,
            isDM: true,
            say
          })) return;

          if (message.user) {
            autoAddUserToHackiChannel({ slackId: message.user }).catch(err => {
              console.warn('[SlackBot] Could not auto-add DM author to #hacki:', err.message);
            });
          }

          const dmThreadTs = message.thread_ts || message.ts;
          const dmHistoryKey = isOneToOneDM ? message.channel : `${message.channel}:${dmThreadTs}`;
          const previousMessages = getRecentDMHistory(dmHistoryKey);
          const threadHistory = message.thread_ts
            ? await getSlackThreadHistory(botApp.client, message)
            : [];
          const memories = getSlackMemories(message.user);
          const instructions = getSlackInstructions(message.user);
          const privateContext = [
            instructions ? `[The user’s custom instructions; follow when relevant unless they conflict with system rules]\n${instructions}` : '',
            memories.length ? `[Private notes the user asked Hacki to remember; use only when relevant. Do not repeat these notes unless asked.]\n${memories.map(item => `- ${item.memory}`).join('\n')}` : ''
          ].filter(Boolean).join('\n\n');
          const userPrompt = privateContext ? `${message.text}\n\n${privateContext}` : message.text;
          const responseStream = createSlackResponseStreamer({
            client: botApp.client,
            channelId: message.channel,
            threadTs: dmThreadTs,
            userId: message.user
          });
          const response = await askHacki(userPrompt, threadHistory.length ? threadHistory : previousMessages, {
            slackUserId: message.user,
            sandboxThreadKey: `${message.channel}:${dmThreadTs}`,
            client: botApp.client,
            channelId: message.channel,
            onTextDelta: delta => responseStream.append(delta),
            onProviderFailure: (providerName, hasFallback) => responseStream.providerFailed(providerName, hasFallback),
            onStreamComplete: sources => responseStream.finish(sources),
            prepareEmail: isOneToOneDM && isEmailConfigured() ? request => handleEmailCommand({
              userId: message.user,
              channelId: message.channel,
              text: `email: ${request.to} | ${request.subject} | ${request.body}`,
              say,
              isDM: true
            }) : undefined,
            prepareChannelCreate: (name, isPrivate) => queueChannelCreate({
              userId: message.user,
              channelId: message.channel,
              threadTs: message.thread_ts,
              name,
              isPrivate,
              say
            }),
            prepareSandboxFileUpload: ({ path, comment }) => queueSandboxFileUpload({
              userId: message.user,
              channelId: message.channel,
              threadTs: dmThreadTs,
              sandboxThreadKey: `${message.channel}:${dmThreadTs}`,
              path,
              comment,
              say
            }),
            prepareSandboxSitePreview: directory => queueSandboxSitePreview({
              userId: message.user,
              channelId: message.channel,
              threadTs: dmThreadTs,
              sandboxThreadKey: `${message.channel}:${dmThreadTs}`,
              directory,
              say
            }),
            prepareGitHubFileEdit: request => queueGitHubFileEdit({
              userId: message.user, channelId: message.channel, threadTs: dmThreadTs, ...request, say
            })
          });
          if (!response.streamed) {
            await say({
              text: formatForSlack(response.answer, response.sources),
              thread_ts: dmThreadTs
            });
          }
          saveDMHistory(dmHistoryKey, [
            ...previousMessages,
            { role: 'user', content: cleanMessageForContext(message.text) },
            { role: 'assistant', content: response.answer }
          ], message.user);
        } catch (err) {
          console.error('[SlackBot] Error replying to DM:', err.message);
          await say({
            text: "Oops! I ran into an issue answering that. Please ask again or check `https://hackclub.com`!"
          });
        }
        return;
      }

      // Continue a conversation in threads Hacki has already joined. Top-level
      // channel messages still require an explicit mention.
      if (message.thread_ts && !message.text.includes(`<@${botUserId}>`)) {
        try {
          if (!(await hasHackiParticipatedInThread(botApp.client, message))) return;
          if (!getUserBySlackId(message.user) && !isAuthVerificationHelpRequest(message.text)) {
            await say({ text: verificationPrompt(), thread_ts: message.thread_ts });
            return;
          }
          if (await handleChannelSearchCommand({ client: botApp.client, channelId: message.channel, text: message.text, threadTs: message.thread_ts, say })) return;
          if (await handleGitHubCommand({ text: message.text, threadTs: message.thread_ts, say })) return;
          if (await handlePageFetchCommand({ text: message.text, threadTs: message.thread_ts, say })) return;
          if (await handleChannelActionCommand({
            client: botApp.client,
            userId: message.user,
            channelId: message.channel,
            text: message.text,
            threadTs: message.thread_ts,
            say
          })) return;
          if (await handleDiagramCommand({
            client: botApp.client,
            channelId: message.channel,
            text: message.text,
            threadTs: message.thread_ts,
            say
          })) return;
          if (await handleCodeCommand({
            userId: message.user,
            channelId: message.channel,
            sandboxThreadId: message.thread_ts,
            text: message.text,
            threadTs: message.thread_ts,
            say
          })) return;
          const threadHistory = await getSlackThreadHistory(botApp.client, message);
          const currentChannel = await getCurrentChannelContext(botApp.client, message.channel);
          const responseStream = createSlackResponseStreamer({
            client: botApp.client,
            channelId: message.channel,
            threadTs: message.thread_ts,
            userId: message.user
          });
          const response = await askHacki(cleanMessageForContext(message.text), threadHistory, {
            slackUserId: message.user,
            sandboxThreadKey: `${message.channel}:${message.thread_ts}`,
            client: botApp.client,
            channelId: message.channel,
            currentChannel,
            targetMessageTs: message.thread_ts,
            onTextDelta: delta => responseStream.append(delta),
            onProviderFailure: (providerName, hasFallback) => responseStream.providerFailed(providerName, hasFallback),
            onStreamComplete: sources => responseStream.finish(sources),
            prepareChannelPost: messageText => queueChannelPost({
              userId: message.user,
              channelId: message.channel,
              threadTs: message.thread_ts,
              messageText,
              say
            }),
            prepareChannelCanvas: request => queueChannelCanvas({
              userId: message.user,
              channelId: message.channel,
              threadTs: message.thread_ts,
              ...request,
              say
            }),
            prepareChannelCreate: (name, isPrivate) => queueChannelCreate({
              userId: message.user,
              channelId: message.channel,
              threadTs: message.thread_ts,
              name,
              isPrivate,
              say
            }),
            prepareSandboxFileUpload: ({ path, comment }) => queueSandboxFileUpload({
              userId: message.user,
              channelId: message.channel,
              threadTs: message.thread_ts,
              sandboxThreadKey: `${message.channel}:${message.thread_ts}`,
              path,
              comment,
              say
            }),
            prepareSandboxSitePreview: directory => queueSandboxSitePreview({
              userId: message.user,
              channelId: message.channel,
              threadTs: message.thread_ts,
              sandboxThreadKey: `${message.channel}:${message.thread_ts}`,
              directory,
              say
            }),
            prepareGitHubFileEdit: request => queueGitHubFileEdit({
              userId: message.user, channelId: message.channel, threadTs: message.thread_ts, ...request, say
            })
          });
          if (!response.streamed) {
            await say({
              text: formatForSlack(response.answer, response.sources),
              thread_ts: message.thread_ts
            });
          }
        } catch (err) {
          console.error('[SlackBot] Error replying in an active thread:', err.message);
          await say({ text: 'Sorry, I hit an issue while answering that. Please try again.', thread_ts: message.thread_ts });
        }
      }
    });

    await botApp.start();
    const reminderTimer = setInterval(() => {
      deliverDueReminders(botApp.client).catch(err => console.warn('[SlackBot] Reminder scheduler error:', err.message));
    }, 10_000);
    reminderTimer.unref?.();
    deliverDueReminders(botApp.client).catch(err => console.warn('[SlackBot] Reminder scheduler error:', err.message));
    console.log('[SlackBot] Hacki Slack Bot is online and connected via Socket Mode!');
    return botApp;
  } catch (error) {
    console.warn(`[SlackBot] Could not start Slack Bot listener: ${error.message}`);
    return null;
  }
}
