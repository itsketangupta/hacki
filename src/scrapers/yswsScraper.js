import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { config } from '../config.js';

let cachedYSWS = null;

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
        const isEnded = cat === 'recentlyEnded' || item.status === 'ended' || item.status === 'closed';
        const isDraft = cat === 'drafts' || item.status === 'draft';
        const isActive = !isEnded && !isDraft && (item.status === 'active' || isLimited || cat === 'indefinite');

        // Check if deadline is in future or past if ISO date
        let hasExpired = false;
        if (item.deadline) {
          const dlTime = Date.parse(item.deadline);
          if (!isNaN(dlTime) && dlTime < Date.now()) {
            hasExpired = true;
          }
        }

        const effectiveStatus = isEnded || hasExpired ? 'ended' : isDraft ? 'draft' : 'active';
        const isNew = isLimited && effectiveStatus === 'active';

        programsList.push({
          name: String(item.name).trim(),
          category: cat,
          status: effectiveStatus,
          isActive: effectiveStatus === 'active',
          isNew,
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
    cachedYSWS = JSON.parse(data);
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
