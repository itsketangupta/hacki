import fs from 'node:fs/promises';
import path from 'node:path';
import { App } from '@slack/bolt';
import { config } from '../config.js';

let cachedAnnouncements = [];
let slackApp = null;
let syncTimer = null;
let nextChannelToSync = 0;
let syncInFlight = false;
let historyRetryAt = 0;
const historyScopeWarnings = new Set();
const CHANNELS_CACHE_FILE = path.join(config.dataDir, 'slack_channels_cache.json');
const ANNOUNCEMENTS_CHECKED_FILE = path.join(config.dataDir, 'announcements.checked-at');
const ANNOUNCEMENTS_CACHE_LIMIT = 10000;
// Keep history reads small and spaced out. Slack can rate-limit bursts across
// hundreds of channels, which previously prevented a snapshot from being
// created at all on a fresh server.
const CHANNELS_PER_SYNC = 10;
const HISTORY_REQUEST_DELAY_MS = 2500;

const slackCollectorLogger = {
  debug: () => {},
  info: (msg, ...args) => console.log(`[SlackCollector] ${msg}`, ...args),
  warn: (msg, ...args) => {
    const s = String(msg || '');
    if (s.includes('rate limit') || s.includes('retry-after')) {
      console.log(`[SlackCollector] Slack API rate limit notice: will retry automatically.`);
      return;
    }
    console.warn(`[SlackCollector] ${msg}`, ...args);
  },
  error: (msg, ...args) => console.error(`[SlackCollector] ${msg}`, ...args),
  setLevel: () => {},
  getLevel: () => 'info',
  setName: () => {}
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const HIRING_REGEX = /\b(look(?:ing)? for|need(?:s)?|recruit(?:ing)?|hir(?:ing|e)|join (?:the|our) team|applications? (?:open|available|link)|call for|accepting)\b[\s\S]{0,100}\b(review(?:er|ers|ing)|fulfill(?:er|ers|ment)|organiz(?:er|ers)|mentor(?:s)?|volunteer(?:s)?|gap year|intern(?:s)?)\b/i;
const OPPORTUNITY_REGEX = /\b(stipend|grant|scholarship|flight|visa letter|deadline|shop drop|shop items?|hyper[- ]?chroma|submission|bount(?:y|ies)|call for|applications? (?:open|available)|accepting applications|volunteer(?:ing)?|seeking (?:help|people|contributors)|looking for (?:help|people|contributors)|join (?:the|our) team)\b/i;
const YSWS_REGEX = /\b(ysws|you ship we ship|new project|launch(?:ed)?|crescent|phantom|horizons|macondo|pixl)\b/i;
const EVENT_REGEX = /\b(festival|conference|summit|meetup|hackathon|event|premiere|screening|workshop|showcase)\b/i;

function cleanSlackText(text = '') {
  return String(text)
    .replace(/<@(?:[A-Z0-9]+|subteam\^[A-Z0-9]+)>/gi, '@member')
    .replace(/<!channel>/gi, '@channel')
    .replace(/<!here>/gi, '@here')
    .replace(/<!everyone>/gi, '@everyone')
    .replace(/<((?:https?:\/\/)[^>|]+)\|([^>]+)>/gi, '$2 ($1)')
    .replace(/<(https?:\/\/[^>]+)>/gi, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function classifyAnnouncement(text = '', channel = '') {
  const isHiring = HIRING_REGEX.test(text);
  const isOpportunity = OPPORTUNITY_REGEX.test(text);
  const isYSWS = YSWS_REGEX.test(text) || channel.includes('ysws');
  const isEvent = EVENT_REGEX.test(text);
  const tags = [];
  if (isHiring) tags.push('hiring');
  if (isOpportunity) tags.push('opportunity');
  if (isYSWS) tags.push('ysws');
  if (isEvent) tags.push('event');
  return { isHiring, isOpportunity, isYSWS, isEvent, kind: isHiring ? 'role' : isEvent ? 'event' : isYSWS ? 'program' : 'opportunity', tags: tags.length ? tags : ['announcement'] };
}

// ---------------------------------------------------------------------------
// Announcement cache helpers
// ---------------------------------------------------------------------------

export async function loadAnnouncements() {
  if (cachedAnnouncements && cachedAnnouncements.length > 0) return cachedAnnouncements;
  try {
    const raw = await fs.readFile(config.announcementsFile, 'utf8');
    const items = JSON.parse(raw);
    cachedAnnouncements = items.map(item => {
      const fullText = `${item.title || ''}\n${item.summary || item.slackSummary || ''}`;
      const classification = classifyAnnouncement(fullText, item.channel || '');
      return { ...item, ...classification, cleanText: cleanSlackText(item.summary || item.slackSummary || item.title || '') };
    });
    return cachedAnnouncements;
  } catch {
    cachedAnnouncements = [];
    return cachedAnnouncements;
  }
}

export async function saveAnnouncements(items) {
  cachedAnnouncements = items;
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(config.announcementsFile, JSON.stringify(items.slice(0, ANNOUNCEMENTS_CACHE_LIMIT), null, 2), 'utf8');
}

export async function getHiringOpportunities() {
  const all = await loadAnnouncements();
  return all.filter(a => a.isHiring || HIRING_REGEX.test(a.cleanText || a.summary || ''));
}

export async function getRecentAnnouncements(limit = 15) {
  const all = await loadAnnouncements();
  return all.slice(0, limit);
}

export async function searchAnnouncements(query = '', { limit = 15 } = {}) {
  const all = await loadAnnouncements();
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const channelNames = [...q.matchAll(/#([a-z0-9_-]+)/g)].map(match => match[1]);
  const stopWords = new Set(['about', 'after', 'again', 'also', 'any', 'are', 'can', 'could', 'does', 'find', 'from', 'have', 'help', 'how', 'into', 'just', 'looking', 'more', 'most', 'that', 'the', 'then', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'you', 'your', 'for', 'and', 'but', 'the', 'is', 'are', 'was', 'were', 'with', 'near', 'want', 'need']);
  const normalizeTerm = term => {
    const synonyms = { reviewers: 'review', reviewer: 'review', reviewing: 'review', fulfillers: 'fulfill', fulfiller: 'fulfill', fulfillment: 'fulfill', fulfilment: 'fulfill', opportunities: 'opportunity', jobs: 'job', roles: 'role', programs: 'program', grants: 'grant', events: 'event' };
    if (synonyms[term]) return synonyms[term];
    if (term.length > 4 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
    if (term.length > 4 && term.endsWith('s')) return term.slice(0, -1);
    return term;
  };
  const normalizeText = text => (String(text).toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g) || []).map(normalizeTerm).join(' ');
  const terms = [...new Set((q.match(/[a-z0-9][a-z0-9_-]{1,}/g) || [])
    .filter(term => !stopWords.has(term) && !channelNames.includes(term))
    .map(normalizeTerm))];
  if (!terms.length && !channelNames.length) return [];
  const phrase = q.replace(/#[a-z0-9_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  return all
    .map(item => {
      const channel = String(item.channel || '').toLowerCase();
      if (channelNames.length && !channelNames.some(name => channel === name || channel.includes(name))) {
        return { item, score: 0, matched: 0 };
      }
      const title = String(item.title || '').toLowerCase();
      const body = `${item.cleanText || ''} ${item.summary || ''}`.toLowerCase();
      const normalizedTitle = normalizeText(title);
      const normalizedBody = normalizeText(body);
      const normalizedChannel = normalizeText(channel);
      const matched = terms.filter(term => normalizedTitle.includes(term) || normalizedBody.includes(term) || normalizedChannel.includes(term)).length;
      const score = terms.reduce((total, term) => total +
        (normalizedTitle.includes(term) ? 5 : 0) +
        (normalizedChannel.includes(term) ? 4 : 0) +
        (normalizedBody.includes(term) ? 1 : 0), 0) +
        (phrase.length > 4 && `${title} ${body}`.includes(phrase) ? 6 : 0) +
        (channelNames.length ? 3 : 0);
      return { item, score, matched };
    })
    .filter(result => result.score > 0 && (channelNames.length > 0 || result.matched >= Math.max(1, Math.ceil(terms.length * 0.4))))
    .sort((a, b) => b.score - a.score || Number(b.item.timestamp || 0) - Number(a.item.timestamp || 0))
    .slice(0, Math.min(Math.max(Number(limit) || 15, 1), 1000))
    .map(result => result.item);
}

// ---------------------------------------------------------------------------
// Channel join rules — MUST be declared before any function that uses them
// ---------------------------------------------------------------------------

/**
 * Channel name must CONTAIN one of these substrings to be auto-joined.
 * This catches entire families like ysws-*, *-bulletin, *-announcement, etc.
 */
const JOIN_KEYWORDS = [
  'bulletin',
  'announcement',
  'opportunit', // matches opportunity and opportunities
  'ysws',
  'bounty',
];

/**
 * Exact channel names that are ALWAYS joined — whitelist.
 * Use this for channels whose names don't contain a keyword above.
 */
const JOIN_EXACT = new Set([
  // YSWS family
  'ysws',
  'ysws-ads',
  'ysws-bulletin',
  'ysws-drops',
  // Opportunity / hiring
  'hc-opportunities',
  'hc-opportunity',
  'opportunities',
  // Official HQ
  'happenings',
  'announcements',
  // Bounties
  'bounty',
  'community-bounties',
  // Misc official
  'slacker-news',
  'the-mothership',
  // YSWS program bulletins
  'phantom-bulletin',
  'crescent-bulletin',
  'horizons-bulletin',
  'macondo-bulletin',
  'pixl-bulletin',
  'tagless-bulletin',
  'venture-bulletin',
  // Other announcement channels
  'zoneout-announcements',
  'terra-announcements',
]);

/**
 * Returns true if the bot should join / monitor this channel.
 * @param {string} name  Raw channel name (without #)
 */
function shouldJoinChannel(name) {
  const n = name.toLowerCase().replace(/^#/, '');
  return JOIN_EXACT.has(n) ||
    config.approvedChannels.includes(n) ||
    JOIN_KEYWORDS.some(keyword => n.includes(keyword));
}

function channelSyncPriority(channel) {
  const name = String(channel.name || '').toLowerCase();
  if (['hc-opportunities', 'hc-opportunity', 'opportunities', 'intl-opportunities', 'bounty', 'community-bounties'].includes(name)) return -1;
  if (name.includes('bulletin') || name.includes('opportunit') || name.includes('bounty')) return 0;
  if (name.includes('announcement') || name === 'announcements' || name === 'happenings') return 1;
  if (name.includes('ysws')) return 2;
  return 3;
}

function prioritizeChannels(channels) {
  return [...channels].sort((a, b) => channelSyncPriority(a) - channelSyncPriority(b) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Startup: join every existing matching channel (runs once in background)
// ---------------------------------------------------------------------------

/**
 * Paginates through ALL public channels in the workspace and joins every one
 * that matches shouldJoinChannel(). The channel cache is a fallback if Slack
 * is temporarily unavailable; successful scans always replace it.
 */
let cachedTargetChannels = null;
let lastSuccessfulChannelScanAt = 0;
let channelCacheComplete = false;
const CHANNEL_RESCAN_INTERVAL_MS = 60 * 60 * 1000;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function joinAllExistingChannels() {
  if (!slackApp) return [];

  if (cachedTargetChannels && channelCacheComplete && Date.now() - lastSuccessfulChannelScanAt < CHANNEL_RESCAN_INTERVAL_MS) {
    return cachedTargetChannels;
  }

  // Keep the last known list as a fallback if Slack's API is temporarily down.
  try {
    const raw = await fs.readFile(CHANNELS_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.channels?.length) {
      cachedTargetChannels = prioritizeChannels(parsed.channels);
      channelCacheComplete = parsed.complete === true;
      lastSuccessfulChannelScanAt = channelCacheComplete ? Number(parsed.timestamp) || 0 : 0;
      if (channelCacheComplete && Date.now() - lastSuccessfulChannelScanAt < CHANNEL_RESCAN_INTERVAL_MS) {
        console.log(`[SlackCollector] Using complete channel scan cache (${cachedTargetChannels.length} matching channels).`);
        return cachedTargetChannels;
      }
    }
  } catch {}

  console.log('[SlackCollector] Scanning ALL existing channels to join matching ones...');

  try {
    // Paginate through every public channel in the workspace
    let allChannels = [];
    let cursor;
    const seenCursors = new Set();
    do {
      const listRes = await slackApp.client.conversations.list({
        types: 'public_channel',
        limit: 1000,
        ...(cursor ? { cursor } : {})
      });
      allChannels = allChannels.concat(listRes.channels || []);
      cursor = listRes.response_metadata?.next_cursor;
      if (cursor) {
        if (seenCursors.has(cursor)) throw new Error('Slack returned a repeated channel-list cursor.');
        seenCursors.add(cursor);
        await sleep(3000);
      }
    } while (cursor);

    console.log(`[SlackCollector] Total public channels in workspace: ${allChannels.length}`);

    const targets = prioritizeChannels(allChannels.filter(c => !c.is_archived && shouldJoinChannel(c.name)));
    cachedTargetChannels = targets;
    channelCacheComplete = true;
    lastSuccessfulChannelScanAt = Date.now();
    console.log(`[SlackCollector] Channels matching join rules (${targets.length}): ${targets.map(c => '#' + c.name).join(', ')}`);

    let joined = 0;
    let alreadyIn = 0;
    let failed = 0;

    for (const ch of targets) {
      if (ch.is_member) {
        alreadyIn++;
        continue;
      }
      try {
        await slackApp.client.conversations.join({ channel: ch.id });
        ch.is_member = true;
        console.log(`[SlackCollector] ✓ Joined #${ch.name} (${ch.id})`);
        joined++;
        await sleep(250);
      } catch (err) {
        const code = err.data?.error || err.message;
        if (code === 'already_in_channel') {
          ch.is_member = true;
          alreadyIn++;
          continue;
        }
        // method_not_supported_for_channel_type = private channel listed as public
        // cant_join_channel = invite-only
        console.log(`[SlackCollector] Notice: could not join #${ch.name}: ${code}`);
        failed++;
      }
    }

    console.log(
      `[SlackCollector] Channel join complete — ` +
      `joined: ${joined}, already member: ${alreadyIn}, failed: ${failed}`
    );
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(CHANNELS_CACHE_FILE, JSON.stringify({
      timestamp: Date.now(),
      complete: true,
      channels: targets
    }, null, 2), 'utf8');
    return targets;
  } catch (err) {
    console.log('[SlackCollector] joinAllExistingChannels notice:', err.message);
    return cachedTargetChannels || [];
  }
}

/** Join a matching channel reported by the live Slack event connection. */
export async function autoJoinMatchingChannel(channel, client) {
  const name = String(channel?.name || '').toLowerCase();
  if (!channel?.id || !name || !shouldJoinChannel(name)) return false;

  try {
    await client.conversations.join({ channel: channel.id });
    console.log(`[SlackCollector] Auto-joined new channel #${name} (${channel.id})`);
  } catch (err) {
    const code = err.data?.error || err.message;
    if (code !== 'already_in_channel') {
      console.warn(`[SlackCollector] Could not auto-join #${name}: ${code}`);
      return false;
    }
  }

  const channelInfo = { ...channel, is_member: true };
  cachedTargetChannels = [
    ...(cachedTargetChannels || []).filter(item => item.id !== channel.id),
    channelInfo
  ];
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(CHANNELS_CACHE_FILE, JSON.stringify({
    timestamp: Date.now(),
    complete: channelCacheComplete,
    channels: cachedTargetChannels
  }, null, 2), 'utf8');
  return true;
}

// ---------------------------------------------------------------------------
// Periodic sync: fetch new messages from all joined channels
// ---------------------------------------------------------------------------

async function syncPublicAnnouncements() {
  if (!slackApp) return;
  if (syncInFlight) {
    console.log('[SlackCollector] Previous sync is still running; skipping overlapping run.');
    return;
  }
  if (Date.now() < historyRetryAt) return;
  syncInFlight = true;
  console.log('[SlackCollector] Checking Slack announcement channels for new messages...');

  try {
    // Rescan the workspace on every cycle so newly created matching channels
    // are joined and their messages become available to Hacki promptly.
    const channels = await joinAllExistingChannels();

    console.log(`[SlackCollector] Monitoring ${channels.length} channels: ${channels.map(c => '#' + c.name).join(', ')}`);

    // Retry cached channels that were not successfully joined during discovery.
    for (const ch of channels) {
      if (!ch.is_member) {
        try {
          await slackApp.client.conversations.join({ channel: ch.id });
          console.log(`[SlackCollector] Re-joined #${ch.name}`);
          await sleep(200);
        } catch (err) {
          const code = err.data?.error || err.message;
          if (code !== 'already_in_channel') {
            console.warn(`[SlackCollector] Could not re-join #${ch.name}: ${code}`);
          }
        }
      }
    }

    let newCount = 0;
    const current = await loadAnnouncements();
    const existingIds = new Set(current.map(c => c.id));

    const batchSize = Math.min(CHANNELS_PER_SYNC, channels.length);
    const batchStart = nextChannelToSync;
    const batch = Array.from({ length: batchSize }, (_, offset) => channels[(batchStart + offset) % channels.length]);
    console.log(`[SlackCollector] Syncing ${batch.length} of ${channels.length} channels in this batch.`);

    let successfulReads = 0;
    let channelsAdvanced = 0;
    for (const ch of batch) {
      try {
        const histRes = await slackApp.client.conversations.history({
          channel: ch.id,
          limit: 25
        });
        successfulReads++;
        channelsAdvanced++;
        await sleep(HISTORY_REQUEST_DELAY_MS);

        for (const msg of histRes.messages || []) {
          if (!msg.text || msg.subtype) continue;
          const id = `${ch.id}:${msg.ts}`;
          if (existingIds.has(id)) continue;

          const text = cleanSlackText(msg.text);
          const classification = classifyAnnouncement(text, ch.name);

          if (text.length > 0) {
            current.unshift({
              id,
              title: text.split('\n')[0].slice(0, 120),
              summary: text,
              slackSummary: msg.text,
              channel: ch.name,
              channelId: ch.id,
              authorId: msg.user,
              timestamp: msg.ts,
              url: `https://slack.com/archives/${ch.id}/p${msg.ts.replace('.', '')}`,
              source: 'Slack',
              ...classification,
              priority: classification.isHiring ? 'high' : 'normal'
            });
            existingIds.add(id);
            newCount++;
          }
        }
      } catch (err) {
        const retryHeader = err.headers?.['retry-after'] || err.data?.retry_after || err.retryAfter;
        const retryFromMessage = String(err.message || '').match(/retry-after\D+(\d+)/i)?.[1];
        const retrySeconds = Number(retryHeader || retryFromMessage);
        const slackError = err.data?.error || '';
        if (slackError === 'missing_scope') {
          const needed = err.data?.needed || 'channels:history';
          if (!historyScopeWarnings.has(needed)) {
            historyScopeWarnings.add(needed);
            console.warn(`[SlackCollector] Slack history sync needs the ${needed} scope. Add it to the Slack app and reinstall the app in the workspace.`);
          }
          historyRetryAt = Date.now() + 5 * 60 * 1000;
          break;
        }
        if (retrySeconds > 0) {
          historyRetryAt = Date.now() + (retrySeconds + 1) * 1000;
          console.warn(`[SlackCollector] Rate limited while reading #${ch.name}; pausing this batch and retrying it after the cooldown.`);
          break;
        } else {
          // No access yet — will be retried in a later batch.
          channelsAdvanced++;
          await sleep(HISTORY_REQUEST_DELAY_MS);
        }
      }
    }
    nextChannelToSync = channels.length ? (batchStart + channelsAdvanced) % channels.length : 0;

    if (successfulReads > 0) {
      current.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      await saveAnnouncements(current);
      console.log(`[SlackCollector] Snapshot saved with ${current.length} announcements (${newCount} new).`);
    }
    if (newCount === 0) {
      console.log('[SlackCollector] Announcements up-to-date.');
    }

    // Record the date of this batch only if at least one channel read succeeded.
    if (successfulReads > 0) {
      await fs.writeFile(ANNOUNCEMENTS_CHECKED_FILE, new Date().toISOString(), 'utf8');
    }
  } catch (error) {
    console.warn(`[SlackCollector] Announcement sync notice: ${error.message}`);
  } finally {
    syncInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export async function initSlackCollector() {
  if (!config.enableSlackSync || !config.slackBotToken) {
    console.log('[SlackCollector] Slack sync disabled or tokens missing. Using cached announcements.');
    await loadAnnouncements();
    return;
  }

  try {
    slackApp = new App({
      token: config.slackBotToken,
      appToken: config.slackAppToken,
      socketMode: Boolean(config.slackAppToken),
      logger: slackCollectorLogger,
      clientOptions: {
        logger: slackCollectorLogger
      }
    });

    console.log('[SlackCollector] Initialized Slack bolt client.');
    await loadAnnouncements();

    // Initial scan plus an hourly fallback catches channels created while the
    // app was offline. New channels are joined immediately by SlackBot events.
    (async () => {
      try {
        await syncPublicAnnouncements();
      } catch (err) {
        console.warn('[SlackCollector] Startup sync notice:', err.message);
      }
    })();

    syncTimer = setInterval(() => {
      syncPublicAnnouncements().catch(err => {
        console.warn(`[SlackCollector] Periodic sync notice: ${err.message}`);
      });
    }, config.slackSyncIntervalMs);

  } catch (error) {
    console.warn(`[SlackCollector] Could not initialize Slack client: ${error.message}`);
    await loadAnnouncements();
  }
}
