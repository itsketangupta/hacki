import fs from 'node:fs/promises';
import { App } from '@slack/bolt';
import { config } from '../config.js';

let cachedAnnouncements = [];
let slackApp = null;
let syncTimer = null;

// Heuristics for reviewer / fulfiller / opportunity identification
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

  return {
    isHiring,
    isOpportunity,
    isYSWS,
    tags: tags.length ? tags : ['announcement']
  };
}

export async function loadAnnouncements() {
  if (cachedAnnouncements && cachedAnnouncements.length > 0) return cachedAnnouncements;
  try {
    const raw = await fs.readFile(config.announcementsFile, 'utf8');
    const items = JSON.parse(raw);
    cachedAnnouncements = items.map(item => {
      const fullText = `${item.title || ''}\n${item.summary || item.slackSummary || ''}`;
      const classification = classifyAnnouncement(fullText, item.channel || '');
      return {
        ...item,
        ...classification,
        cleanText: cleanSlackText(item.summary || item.slackSummary || item.title || '')
      };
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

    // Run channel sync once on start, then periodically
    syncPublicAnnouncements().catch(err => {
      console.warn(`[SlackCollector] Initial channel sync warning: ${err.message}`);
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

async function syncPublicAnnouncements() {
  if (!slackApp) return;
  console.log('[SlackCollector] Checking Slack public announcement channels for new updates...');

  try {
    // Paginate through ALL channels in the workspace
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

    // Keywords that identify channels Hacki should join and monitor
    const JOIN_KEYWORDS = [
      'bulletin', 'hc-opportunit', 'opportunity', 'opportunities',
      'ysws', 'announcement', 'announcements', 'info', 'happenings'
    ];

    const channels = allChannels.filter(c => {
      const name = c.name.toLowerCase();
      return (
        config.approvedChannels.includes(name) ||
        JOIN_KEYWORDS.some(kw => name.includes(kw))
      );
    });

    // Auto-join all matching channels so we can read their messages
    for (const ch of channels) {
      if (!ch.is_member) {
        try {
          await slackApp.client.conversations.join({ channel: ch.id });
          console.log(`[SlackCollector] Auto-joined #${ch.name}`);
        } catch (joinErr) {
          // Already in channel or can't join — safe to ignore
        }
      }
    }

    let newCount = 0;
    const current = await loadAnnouncements();
    const existingIds = new Set(current.map(c => c.id));

    for (const ch of channels.slice(0, 20)) {
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

          // Only keep announcements, opportunities, or news
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
      } catch (err) {
        // May lack access to some channels, safe to ignore
      }
    }

    if (newCount > 0) {
      current.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      await saveAnnouncements(current);
      console.log(`[SlackCollector] Synced ${newCount} new Slack announcements!`);
    } else {
      console.log('[SlackCollector] Announcements are up-to-date.');
    }
  } catch (error) {
    console.warn(`[SlackCollector] Announcement sync skipped: ${error.message}`);
  }
}
