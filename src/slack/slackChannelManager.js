import { WebClient } from '@slack/web-api';
import { config } from '../config.js';

let webClient = null;
let resolvedChannelId = null;
const autoAddedUsers = new Set();

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

  // Always resolve to #hacki — never #hack-wire or any other channel
  const target = 'hacki';

  // If SLACK_HACKI_CHANNEL is explicitly set to a Slack channel ID, use it directly
  const envValue = (config.slackHackiChannel || '').trim();
  if (/^[CGD][A-Z0-9]{8,}$/.test(envValue)) {
    resolvedChannelId = envValue;
    console.log(`[SlackChannelManager] Using configured #hacki channel ID: ${resolvedChannelId}`);
    return resolvedChannelId;
  }

  const client = getClient();
  if (!client) return null;

  try {
    let cursor;
    let pageCount = 0;

    do {
      const res = await client.conversations.list({
        types: 'public_channel',
        limit: 200,
        cursor
      });

      if (res.channels) {
        // Strictly match the channel named 'hacki' only
        const found = res.channels.find(c => c.name.toLowerCase() === target);
        if (found) {
          resolvedChannelId = found.id;
          console.log(`[SlackChannelManager] Found #hacki with ID ${found.id}`);
          return resolvedChannelId;
        }
      }

      cursor = res.response_metadata?.next_cursor;
      pageCount++;
    } while (cursor && pageCount < 10);

    console.warn(`[SlackChannelManager] Could not find #hacki channel. Set SLACK_HACKI_CHANNEL=<channel-id> in .env.`);
    return null;
  } catch (err) {
    console.warn(`[SlackChannelManager] Error searching for #hacki:`, err.message);
    return null;
  }
}

export const getHackwireChannelId = getHackiChannelId;

/**
 * Add a user to the Hacki Slack channel without sending welcome messages.
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

/** Add a user once after an eligible login or message, without a welcome DM/post. */
export async function autoAddUserToHackiChannel({ slackId, name }) {
  if (!slackId) return { ok: false, reason: 'no_slack_id' };
  if (autoAddedUsers.has(slackId)) return { ok: true, status: 'already_processed' };

  const result = await addUserToHackiChannel({ slackId, name });
  if (result.ok) autoAddedUsers.add(slackId);
  return result;
}

export const addUserToHackwireChannel = addUserToHackiChannel;
