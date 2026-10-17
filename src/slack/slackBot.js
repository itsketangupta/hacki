import { App } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { askHacki } from '../ai/hackiAgent.js';
import { addUserToHackiChannel } from './slackChannelManager.js';

let botApp = null;
const welcomedUsersFile = path.join(config.dataDir, 'welcomed_users.json');
let welcomedUsers = new Set();

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
function formatForSlack(text) {
  // Replace markdown code fences (``` ... ```) with plain indented text for Slack
  let out = String(text || '').replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => code.trim());
  // Slack block text limit is 3000 chars
  if (out.length > 3000) {
    out = out.slice(0, 2900) + '\n\n_...response truncated. Ask on [hackclub.com](https://hackclub.com) for more!_';
  }
  return out;
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
      clientOptions: { retryConfig: { retries: 0 } }
    });

    // 1. Auto-invite fresh new people to #hacki when they join the workspace
    botApp.event('team_join', async ({ event, client }) => {
      const userId = event.user?.id || event.user;
      if (userId) {
        addUserToHackiChannel({ slackId: userId }).catch(() => {});
      }
    });

    // 2. Auto-invite users when they open Hacki's App Home for the first time
    botApp.event('app_home_opened', async ({ event, client }) => {
      const userId = event.user;
      if (userId) {
        addUserToHackiChannel({ slackId: userId }).catch(() => {});
      }
    });

    // 3. Listen for mentions (@Hacki what is the newest YSWS?)
    botApp.event('app_mention', async ({ event, say, client }) => {
      console.log(`[SlackBot] Received mention in #${event.channel} from ${event.user}`);
      try {
        // Auto-invite user to #hacki whenever they mention the bot
        if (event.user) {
          addUserToHackiChannel({ slackId: event.user }).catch(() => {});
        }

        // Strip the bot mention tag
        const cleanPrompt = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
        const response = await askHacki(cleanPrompt);

        await say({
          text: formatForSlack(response.answer)
        });
      } catch (err) {
        console.error('[SlackBot] Error replying to mention:', err.message);
        await say({
          text: "Oops! I ran into an issue finding that answer. Check `https://hackclub.com/team` or `https://ysws.hackclub.com/` in the meantime!"
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
          // Auto-invite user to #hacki on first interaction
          if (message.user) {
            addUserToHackiChannel({ slackId: message.user }).catch(() => {});
          }

          const response = await askHacki(message.text);
          await say({
            text: formatForSlack(response.answer)
          });
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
