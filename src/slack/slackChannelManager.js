import { WebClient } from '@slack/web-api';
import { config } from '../config.js';
import { sendWelcomeMessage } from './slackBot.js';

let webClient = null;
let resolvedChannelId = null;

function getClient() {
  if (!webClient && config.slackBotToken) {
    webClient = new WebClient(config.slackBotToken);
  }
  return webClient;
}

/**
 * Resolve the channel ID for the Hacki channel (#hacki).
 * Supports direct channel IDs (e.g. C0123456789) or channel names (e.g. 'hacki').
 */
export async function getHackiChannelId() {
  if (resolvedChannelId) return resolvedChannelId;

  const target = (config.slackHackiChannel || 'hacki').trim();

  // If target looks like a Slack channel ID (starts with C, G, or D followed by alphanumeric)
  if (/^[CGD][A-Z0-9]{8,}$/.test(target)) {
    resolvedChannelId = target;
    return resolvedChannelId;
  }

  // If news channel ID is explicitly configured and valid
  if (config.slackNewsChannel && /^[CGD][A-Z0-9]{8,}$/.test(config.slackNewsChannel)) {
    resolvedChannelId = config.slackNewsChannel;
    return resolvedChannelId;
  }

  const client = getClient();
  if (!client) return null;

  const cleanName = target.replace(/^#/, '').toLowerCase();

  try {
    let cursor;
    let found = null;
    let pageCount = 0;

    do {
      const res = await client.conversations.list({
        types: 'public_channel',
        limit: 200,
        cursor
      });

      if (res.channels) {
        found = res.channels.find(c => {
          const n = c.name.toLowerCase();
          return n === cleanName || n === 'hacki';
        });

        if (found) {
          resolvedChannelId = found.id;
          console.log(`[SlackChannelManager] Found channel #${found.name} with ID ${found.id}`);
          return resolvedChannelId;
        }
      }

      cursor = res.response_metadata?.next_cursor;
      pageCount++;
    } while (cursor && pageCount < 10);

    // If channel wasn't found in public list, check if news channel was set
    if (config.slackNewsChannel) {
      console.log(`[SlackChannelManager] Could not find #${cleanName}, defaulting to SLACK_NEWS_CHANNEL: ${config.slackNewsChannel}`);
      resolvedChannelId = config.slackNewsChannel;
      return resolvedChannelId;
    }

    console.warn(`[SlackChannelManager] Could not resolve channel ID for #${cleanName}. Set SLACK_HACKI_CHANNEL in .env to the channel ID.`);
    return null;
  } catch (err) {
    console.warn(`[SlackChannelManager] Error searching for channel #${cleanName}:`, err.message);
    if (config.slackNewsChannel) {
      resolvedChannelId = config.slackNewsChannel;
      return resolvedChannelId;
    }
    return null;
  }
}

export const getHackwireChannelId = getHackiChannelId;

/**
 * Automatically add a user to the Hacki Slack channel when they log in.
 * @param {Object} options
 * @param {string} options.slackId User's Slack ID (e.g. U0123456789)
 * @param {string} [options.email] User's email
 * @param {string} [options.name] User's display name
 */
export async function addUserToHackiChannel({ slackId, email, name }) {
  if (!config.slackBotToken) {
    console.log('[SlackChannelManager] Slack bot token not configured. Skipping Slack channel invite.');
    return { ok: false, reason: 'no_bot_token' };
  }

  const client = getClient();
  if (!client) {
    return { ok: false, reason: 'no_client' };
  }

  let userSlackId = slackId;

  // If slackId is missing but email is provided, try looking up the Slack user by email
  if (!userSlackId && email) {
    try {
      const userLookup = await client.users.lookupByEmail({ email });
      if (userLookup.ok && userLookup.user?.id) {
        userSlackId = userLookup.user.id;
        console.log(`[SlackChannelManager] Resolved Slack ID ${userSlackId} for email ${email}`);
      }
    } catch (lookupErr) {
      // Lookup by email may require users:read.email scope
      console.warn(`[SlackChannelManager] Could not lookup user by email (${email}): ${lookupErr.data?.error || lookupErr.message}`);
    }
  }

  if (!userSlackId) {
    console.warn(`[SlackChannelManager] No Slack ID available for ${name || email || 'user'}.`);
    return { ok: false, reason: 'no_slack_id' };
  }

  const channelId = await getHackiChannelId();
  if (!channelId) {
    console.warn('[SlackChannelManager] Target channel ID not found. Set SLACK_HACKI_CHANNEL in .env.');
    return { ok: false, reason: 'channel_not_found' };
  }

  // Ensure bot is in channel first
  try {
    await client.conversations.join({ channel: channelId });
  } catch (joinErr) {
    // If bot is already in channel or join fails, continue
    if (joinErr.data?.error !== 'already_in_channel') {
      console.log(`[SlackChannelManager] Bot join note for ${channelId}:`, joinErr.data?.error || joinErr.message);
    }
  }

  // Invite user to channel
  try {
    const inviteRes = await client.conversations.invite({
      channel: channelId,
      users: userSlackId
    });

    if (inviteRes.ok) {
      console.log(`[SlackChannelManager] Successfully added user ${userSlackId} (${name || 'user'}) to #hacki (${channelId})!`);

      // Post a friendly welcome message in channel
      try {
        await client.chat.postMessage({
          channel: channelId,
          text: `👋 Welcome <@${userSlackId}> to Hack Club! I am Hacki, here to help you. Whichever question you have, ask me!`
        });
      } catch (postErr) {
        // chat:write might have restrictions, don't fail invite if message fails
      }

      // Also send a direct welcome DM to the fresh user
      sendWelcomeMessage(userSlackId).catch(() => {});

      return { ok: true, status: 'invited', channelId };
    }

    return { ok: true, status: 'invited', channelId };
  } catch (inviteErr) {
    const errCode = inviteErr.data?.error || inviteErr.message;

    if (errCode === 'already_in_channel') {
      console.log(`[SlackChannelManager] User ${userSlackId} is already in #hacki (${channelId}).`);
      return { ok: true, status: 'already_in_channel', channelId };
    }

    if (errCode === 'missing_scope') {
      console.warn(
        `[SlackChannelManager] Slack bot token is missing required scope to invite users. ` +
        `Needed: 'channels:write.invites' (or 'groups:write.invites'). ` +
        `Please add 'channels:write.invites' to your Slack App under OAuth & Permissions at https://api.slack.com/apps.`
      );
      return { ok: false, reason: 'missing_scope', needed: 'channels:write.invites' };
    }

    if (errCode === 'cant_invite_self') {
      return { ok: true, status: 'is_bot_self' };
    }

    console.warn(`[SlackChannelManager] Failed to invite user ${userSlackId} to ${channelId}: ${errCode}`);
    return { ok: false, reason: errCode };
  }
}

export const addUserToHackwireChannel = addUserToHackiChannel;
