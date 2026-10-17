import fs from 'node:fs/promises';
import { App } from '@slack/bolt';
import { config } from '../config.js';

let cachedAnnouncements = [];
let slackApp = null;
let syncTimer = null;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const HIRING_REGEX = /\b(look(?:ing)? for|need(?:s)?|recruit(?:ing)?|hir(?:ing|e)|join (?:the|our) team|applications? (?:open|available|link)|call for|accepting)\b[\s\S]{0,100}\b(review(?:er|ers|ing)|fulfill(?:er|ers|ment)|organiz(?:er|ers)|mentor(?:s)?|volunteer(?:s)?|gap year|intern(?:s)?)\b/i;
const OPPORTUNITY_REGEX = /\b(stipend|grant|scholarship|flight|visa letter|deadline|shop drop|shop items?|hyper[- ]?chroma|submission|bounty)\b/i;
const YSWS_REGEX = /\b(ysws|you ship we ship|new project|launch(?:ed)?|crescent|phantom|horizons|macondo|pixl)\b/i;

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
  const tags = [];
  if (isHiring) tags.push('hiring');
  if (isOpportunity) tags.push('opportunity');
  if (isYSWS) tags.push('ysws');
  return { isHiring, isOpportunity, isYSWS, tags: tags.length ? tags : ['announcement'] };
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
  await fs.writeFile(config.announcementsFile, JSON.stringify(items.slice(0, 500), null, 2), 'utf8');
}

export async function getHiringOpportunities() {
  const all = await loadAnnouncements();
  return all.filter(a => a.isHiring || HIRING_REGEX.test(a.cleanText || a.summary || ''));
}

export async function getRecentAnnouncements(limit = 15) {
  const all = await loadAnnouncements();
  return all.slice(0, limit);
}

export async function searchAnnouncements(query = '') {
  const all = await loadAnnouncements();
  const q = query.toLowerCase().trim();
  if (!q) return all.slice(0, 15);
  return all.filter(item => {
    const text = `${item.title || ''} ${item.summary || ''} ${item.channel || ''}`.toLowerCase();
    return text.includes(q);
  });
}

// ---------------------------------------------------------------------------
// Channel join rules — MUST be declared before any function that uses them
// ---------------------------------------------------------------------------

/**
 * Channel name must CONTAIN one of these substrings to be auto-joined.
 * This catches entire families like ysws-*, *-bulletin, *-announcement, etc.
 */
const JOIN_KEYWORDS = [
  'bulletin',       // phantom-bulletin, crescent-bulletin, any-new-ysws-bulletin
  'announcement',   // announcements, zoneout-announcements, terra-announcements
  'announcements',
  'opportunity',    // hc-opportunity, hc-opportunities, opportunities
  'opportunities',
  'hiring',
  'jobs',
  'careers',
  'happenings',     // #happenings
  'bounty',         // #bounty, #community-bounties
  'bounties',
  'slacker',        // #slacker-news
  'mothership',     // #the-mothership
  'ysws',           // #ysws, #ysws-ads, #ysws-bulletin, #ysws-drops, #ysws-anything
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
 * Channel name substrings that are NEVER joined even if a keyword matches.
 * These are too noisy or off-topic.
 */
const SKIP_PATTERNS = [
  '-help',
  '-discussion',
  '-general',
  '-chat',
  '-showcase',
  '-submissions',
  '-submit',
  '-staff',
  '-admin',
  '-internal',
  '-private',
  '-reviews',
  '-review',
  '-dev',
  '-testing',
  '-test',
  '-random',
  '-off-topic',
];

/**
 * Returns true if the bot should join / monitor this channel.
 * @param {string} name  Raw channel name (without #)
 */
function shouldJoinChannel(name) {
  const n = name.toLowerCase().replace(/^#/, '');

  // Hard skip — never join these
  if (SKIP_PATTERNS.some(p => n.includes(p))) return false;

  // Exact whitelist — always join these
  if (JOIN_EXACT.has(n)) return true;

  // Env-var approved channels — always join
  if (config.approvedChannels.includes(n)) return true;

  // Keyword substring match — join anything containing these words
  if (JOIN_KEYWORDS.some(kw => n.includes(kw))) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Startup: join every existing matching channel (runs once in background)
// ---------------------------------------------------------------------------

/**
 * Paginates through ALL public channels in the workspace and joins every one
 * that matches shouldJoinChannel(). Handles channels that existed before the
 * bot was installed — runs non-blocking in the background at startup.
 */
async function joinAllExistingChannels() {
  if (!slackApp) return;
  console.log('[SlackCollector] Scanning ALL existing channels to join matching ones...');

  try {
    // Paginate through every public channel in the workspace
    let allChannels = [];
    let cursor;
    do {
      const listRes = await slackApp.client.conversations.list({
        types: 'public_channel',
        exclude_archived: true,
        limit: 200,
        ...(cursor ? { cursor } : {})
      });
      allChannels = allChannels.concat(listRes.channels || []);
      cursor = listRes.response_metadata?.next_cursor;
    } while (cursor);

    console.log(`[SlackCollector] Total public channels in workspace: ${allChannels.length}`);

    const targets = allChannels.filter(c => shouldJoinChannel(c.name));
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
        console.log(`[SlackCollector] ✓ Joined #${ch.name} (${ch.id})`);
        joined++;
      } catch (err) {
        const code = err.data?.error || err.message;
        if (code === 'already_in_channel') {
          alreadyIn++;
          continue;
        }
        // method_not_supported_for_channel_type = private channel listed as public
        // cant_join_channel = invite-only
        console.warn(`[SlackCollector] ✗ Could not join #${ch.name}: ${code}`);
        failed++;
      }
    }

    console.log(
      `[SlackCollector] Channel join complete — ` +
      `joined: ${joined}, already member: ${alreadyIn}, failed: ${failed}`
    );
  } catch (err) {
    console.warn('[SlackCollector] joinAllExistingChannels error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Periodic sync: fetch new messages from all joined channels
// ---------------------------------------------------------------------------

async function syncPublicAnnouncements() {
  if (!slackApp) return;
  console.log('[SlackCollector] Checking Slack announcement channels for new messages...');

  try {
    // Use conversations.list with types=public_channel to get all public channels
    // Then filter to ones the bot is already a member of for history fetch
    let allChannels = [];
    let cursor;
    do {
      const listRes = await slackApp.client.conversations.list({
        types: 'public_channel',
        exclude_archived: true,
        limit: 200,
        ...(cursor ? { cursor } : {})
      });
      allChannels = allChannels.concat(listRes.channels || []);
      cursor = listRes.response_metadata?.next_cursor;
    } while (cursor);

    const channels = allChannels.filter(c => shouldJoinChannel(c.name));
    console.log(`[SlackCollector] Monitoring ${channels.length} channels: ${channels.map(c => '#' + c.name).join(', ')}`);

    // Re-join any channel the bot was removed from since last sync
    for (const ch of channels) {
      if (!ch.is_member) {
        try {
          await slackApp.client.conversations.join({ channel: ch.id });
          console.log(`[SlackCollector] Re-joined #${ch.name}`);
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

    for (const ch of channels) {
      try {
        const histRes = await slackApp.client.conversations.history({
          channel: ch.id,
          limit: 10
        });

        for (const msg of histRes.messages || []) {
          if (!msg.text || msg.subtype) continue;
          const id = `${ch.id}:${msg.ts}`;
          if (existingIds.has(id)) continue;

          const text = cleanSlackText(msg.text);
          const classification = classifyAnnouncement(text, ch.name);

          if (classification.isHiring || classification.isOpportunity || classification.isYSWS || text.length > 80) {
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
      } catch {
        // No access yet — will be joined next cycle
      }
    }

    if (newCount > 0) {
      current.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      await saveAnnouncements(current);
      console.log(`[SlackCollector] Synced ${newCount} new announcements.`);
    } else {
      console.log('[SlackCollector] Announcements up-to-date.');
    }
  } catch (error) {
    console.warn(`[SlackCollector] Announcement sync skipped: ${error.message}`);
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
      clientOptions: { retryConfig: { retries: 0 } }
    });

    console.log('[SlackCollector] Initialized Slack bolt client.');
    await loadAnnouncements();

    // Auto-join any NEW channel the moment it's created
    slackApp.event('channel_created', async ({ event }) => {
      const name = (event.channel?.name || '').toLowerCase();
      if (shouldJoinChannel(name)) {
        try {
          await slackApp.client.conversations.join({ channel: event.channel.id });
          console.log(`[SlackCollector] Auto-joined new channel #${name}`);
        } catch (err) {
          console.warn(`[SlackCollector] Could not join new #${name}: ${err.data?.error || err.message}`);
        }
      }
    });

    // Join all existing matching channels in background (non-blocking)
    joinAllExistingChannels().catch(err => {
      console.warn('[SlackCollector] joinAllExistingChannels warning:', err.message);
    });

    // Fetch announcements from all joined channels, then repeat every interval
    syncPublicAnnouncements().catch(err => {
      console.warn(`[SlackCollector] Initial sync warning: ${err.message}`);
    });

    syncTimer = setInterval(() => {
      syncPublicAnnouncements().catch(err => {
        console.warn(`[SlackCollector] Periodic sync warning: ${err.message}`);
      });
    }, config.slackSyncIntervalMs);

  } catch (error) {
    console.warn(`[SlackCollector] Could not initialize Slack client: ${error.message}`);
    await loadAnnouncements();
  }
}
