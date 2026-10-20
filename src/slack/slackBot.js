import { App } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { askHacki } from '../ai/hackiAgent.js';
import { autoJoinMatchingChannel } from './announcementsCollector.js';
import { autoAddUserToHackiChannel } from './slackChannelManager.js';

let botApp = null;
const welcomedUsersFile = path.join(config.dataDir, 'welcomed_users.json');
let welcomedUsers = new Set();
const dmHistories = new Map();
const DM_HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const DM_HISTORY_LIMIT = 40;

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
  try {
    const result = await client.conversations.info({ channel: channelId });
    const channel = result.channel || {};
    return {
      id: channel.id || channelId,
      name: channel.name || '',
      purpose: channel.purpose?.value || '',
      topic: channel.topic?.value || ''
    };
  } catch (err) {
    console.log(`[SlackBot] Current channel details unavailable (${err.data?.error || err.message}).`);
    return { id: channelId, name: '', purpose: '', topic: '' };
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

function saveDMHistory(channelId, messages) {
  dmHistories.set(channelId, { messages: messages.slice(-DM_HISTORY_LIMIT), updatedAt: Date.now() });
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

    // The collector uses a Web API client for scheduled syncing. Register
    // channel creation on this running Socket Mode app so matching new public
    // channels are joined immediately.
    botApp.event('channel_created', async ({ event, client }) => {
      await autoJoinMatchingChannel(event.channel, client);
    });

    // Only a human's active interaction can trigger a silent #hacki invite.

    // 1. Listen for mentions (@Hacki what is the newest YSWS?)
    botApp.event('app_mention', async ({ event, say }) => {
      if (event.bot_id || event.subtype === 'bot_message') return;
      console.log(`[SlackBot] Received mention in #${event.channel} from ${event.user}`);
      try {
        if (event.user) {
          autoAddUserToHackiChannel({ slackId: event.user }).catch(err => {
            console.warn('[SlackBot] Could not auto-add mention author to #hacki:', err.message);
          });
        }

        // Strip the bot mention tag
        const cleanPrompt = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
        const threadHistory = await getSlackThreadHistory(botApp.client, event);
        const currentChannel = await getCurrentChannelContext(botApp.client, event.channel);
        const response = await askHacki(cleanPrompt, threadHistory, { currentChannel });

        await say({
          text: formatForSlack(response.answer, response.sources),
          thread_ts: event.ts  // reply in thread when mentioned in a channel
        });
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

      if (isDM) {
        console.log(`[SlackBot] Received DM from ${message.user}: "${message.text}"`);
        try {
          if (message.user) {
            autoAddUserToHackiChannel({ slackId: message.user }).catch(err => {
              console.warn('[SlackBot] Could not auto-add DM author to #hacki:', err.message);
            });
          }

          const previousMessages = getRecentDMHistory(message.channel);
          const response = await askHacki(message.text, previousMessages);
          await say({
            text: formatForSlack(response.answer, response.sources)
          });
          saveDMHistory(message.channel, [
            ...previousMessages,
            { role: 'user', content: cleanMessageForContext(message.text) },
            { role: 'assistant', content: response.answer }
          ]);
        } catch (err) {
          console.error('[SlackBot] Error replying to DM:', err.message);
          await say({
            text: "Oops! I ran into an issue answering that. Please ask again or check `https://hackclub.com`!"
          });
        }
      }
    });

    await botApp.start();
    console.log('[SlackBot] Hacki Slack Bot is online and connected via Socket Mode!');
    return botApp;
  } catch (error) {
    console.warn(`[SlackBot] Could not start Slack Bot listener: ${error.message}`);
    return null;
  }
}
