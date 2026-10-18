import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { config } from '../config.js';

let cachedYSWS = null;

function isPastDeadline(deadline, now = Date.now()) {
  if (!deadline) return false;
  const value = String(deadline).trim();
  let deadlineTime;
  const monthOnly = value.match(/^(\d{4})-(\d{2})$/);
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (monthOnly) {
    deadlineTime = Date.UTC(Number(monthOnly[1]), Number(monthOnly[2]), 0, 23, 59, 59, 999);
  } else if (dateOnly) {
    deadlineTime = Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 23, 59, 59, 999);
  } else {
    deadlineTime = Date.parse(value);
  }
  return Number.isFinite(deadlineTime) && deadlineTime < now;
}

function openedRecently(opens, now = Date.now()) {
  if (!opens) return false;
  const openedAt = Date.parse(String(opens));
  const age = now - openedAt;
  return Number.isFinite(openedAt) && age >= 0 && age <= 30 * 24 * 60 * 60 * 1000;
}

export async function fetchYSWS() {
  console.log('[YSWSScraper] Fetching YSWS catalog from https://ysws.hackclub.com/data.yml...');
  try {
    const res = await fetch('https://ysws.hackclub.com/data.yml', {
      headers: {
        'User-Agent': 'HackiBot/1.0 (Hack Club Community Assistant; https://hackclub.com)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ysws.hackclub.com/data.yml`);
    const yamlText = await res.text();
    const parsed = yaml.load(yamlText) || {};

    const programsList = [];

    const categories = ['limitedTime', 'indefinite', 'recentlyEnded', 'drafts'];

    for (const cat of categories) {
      const items = Array.isArray(parsed[cat]) ? parsed[cat] : [];
      for (const item of items) {
        if (!item || !item.name) continue;

        const isLimited = cat === 'limitedTime';
        const isEnded = cat === 'recentlyEnded' || ['ended', 'closed', 'expired', 'completed'].includes(String(item.status || '').toLowerCase());
        const isDraft = cat === 'drafts' || item.status === 'draft';
        const isActive = !isEnded && !isDraft && (item.status === 'active' || isLimited || cat === 'indefinite');

        // Check if deadline is in future or past if ISO date
        const hasExpired = isPastDeadline(item.deadline);

        const effectiveStatus = isEnded || hasExpired ? 'ended' : isDraft ? 'draft' : 'active';
        // A limited-time category does not mean a program is newly launched.
        // Only an explicit catalog flag or a recent opening earns the NEW label.
        const isNew = effectiveStatus === 'active' && Boolean(item.isNew || item.new || openedRecently(item.opens));

        programsList.push({
          name: String(item.name).trim(),
          category: cat,
          status: effectiveStatus,
          isActive: effectiveStatus === 'active',
          isNew,
          explicitlyNew: Boolean(item.isNew || item.new),
          description: item.description || '',
          detailedDescription: item.detailedDescription || item.description || '',
          website: item.website || '',
          slackChannel: item.slackChannel || (item.slack ? item.slack.split('/').pop() : ''),
          slack: item.slack || '',
          opens: item.opens ? String(item.opens) : null,
          deadline: item.deadline ? String(item.deadline) : null,
          steps: Array.isArray(item.steps) ? item.steps : [],
          details: Array.isArray(item.details) ? item.details : [],
          prizes: Array.isArray(item.prizes) ? item.prizes : [],
          requirements: Array.isArray(item.requirements) ? item.requirements : []
        });
      }
    }

    // Sort: active new limited-time first, then active indefinite, then recently ended
    programsList.sort((a, b) => {
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return a.name.localeCompare(b.name);
    });

    // Save to disk
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(config.yswsFile, JSON.stringify(programsList, null, 2), 'utf8');

    cachedYSWS = programsList;
    console.log(`[YSWSScraper] Successfully indexed ${programsList.length} YSWS programs (${programsList.filter(p => p.isActive).length} active).`);
    return programsList;
  } catch (error) {
    console.error(`[YSWSScraper] Failed to fetch live YSWS: ${error.message}`);
    if (cachedYSWS && cachedYSWS.length > 0) return cachedYSWS;
    return loadYSWS();
  }
}

export async function loadYSWS() {
  if (cachedYSWS && cachedYSWS.length > 0) return cachedYSWS;
  try {
    const data = await fs.readFile(config.yswsFile, 'utf8');
    cachedYSWS = JSON.parse(data).map(program => {
      // Older cache files treated every limited-time program as "new". Until
      // the next live refresh, keep only explicit or recently opened entries.
      const explicitlyNew = Boolean(program.explicitlyNew);
      const isNew = program.status === 'active' && (explicitlyNew || openedRecently(program.opens));
      return { ...program, isNew };
    });
    return cachedYSWS;
  } catch {
    return fetchYSWS();
  }
}

export async function getNewYSWS() {
  const programs = await loadYSWS();
  return programs.filter(p => p.isNew && p.isActive);
}

export async function getActiveYSWS() {
  const programs = await loadYSWS();
  return programs.filter(p => p.isActive);
}

export async function searchYSWS(query = '') {
  const programs = await loadYSWS();
  const q = query.toLowerCase().trim();
  if (!q) return programs.filter(p => p.isActive).slice(0, 20);

  return programs.filter(p => {
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.detailedDescription.toLowerCase().includes(q) ||
      p.slackChannel.toLowerCase().includes(q)
    );
  });
}
