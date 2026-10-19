import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

// Primary Hack Club sources plus the official GitHub repositories. Pages are
// cached locally so answers still have useful context if a site is unavailable.
const SOURCES = [
  { title: 'Hack Club — About', url: 'https://hackclub.com/' },
  { title: 'Hack Club Programs', url: 'https://hackclub.com/programs' },
  { title: 'Hack Club Clubs', url: 'https://clubs.hackclub.com/' },
  { title: 'Hack Club Workshops', url: 'https://workshops.hackclub.com/' },
  { title: 'Hack Club Hackathons', url: 'https://hackclub.com/hackathons' },
  { title: 'Hack Club Bank (HCB)', url: 'https://hcb.hackclub.com/' },
  { title: 'Hack Club Community & Code of Conduct', url: 'https://github.com/hackclub/hackclub' },
  { title: 'HCB Open Source Documentation', url: 'https://github.com/hackclub/hcb' },
  { title: 'Hack Club Help', url: 'https://github.com/hackclub/help' }
];
const CACHE_FILE = path.join(config.dataDir, 'official_knowledge.json');
const MAX_DOC_CHARS = 24000;
let cachedDocs = null;

function htmlToText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim().slice(0, MAX_DOC_CHARS);
}

export async function loadOfficialKnowledge() {
  if (cachedDocs) return cachedDocs;
  try {
    cachedDocs = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    return cachedDocs;
  } catch {
    cachedDocs = [];
    return cachedDocs;
  }
}

export async function fetchOfficialKnowledge() {
  const previous = await loadOfficialKnowledge();
  const updates = await Promise.all(SOURCES.map(async source => {
    try {
      const response = await fetch(source.url, {
        headers: { 'User-Agent': 'HackiBot/1.0 (Hack Club Community Assistant; https://hackclub.com)' },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = htmlToText(await response.text());
      if (text.length < 100) throw new Error('Page had too little readable text');
      return { ...source, text, fetchedAt: new Date().toISOString() };
    } catch (error) {
      const old = previous.find(doc => doc.url === source.url);
      console.warn(`[OfficialKnowledge] Could not refresh ${source.url}: ${error.message}`);
      return old || null;
    }
  }));
  cachedDocs = updates.filter(Boolean);
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cachedDocs, null, 2), 'utf8');
  console.log(`[OfficialKnowledge] Indexed ${cachedDocs.length} official Hack Club knowledge sources.`);
  return cachedDocs;
}

export async function searchOfficialKnowledge(query, limit = 3) {
  const docs = await loadOfficialKnowledge();
  const stopWords = new Set(['what', 'when', 'where', 'which', 'with', 'from', 'that', 'this', 'about', 'does', 'have', 'hack', 'club', 'tell', 'please', 'could', 'would', 'should', 'find', 'show', 'give', 'need', 'want', 'info', 'information']);
  const terms = [...new Set(String(query || '').toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) || [])]
    .filter(word => !stopWords.has(word))
    .map(word => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word);
  if (!terms.length) return [];

  const matches = [];
  for (const doc of docs) {
    const paragraphs = String(doc.text || '').split(/\n+/).map(p => p.trim()).filter(p => p.length > 60);
    for (const paragraph of paragraphs) {
      const lower = paragraph.toLowerCase();
      const title = String(doc.title || '').toLowerCase();
      const url = String(doc.url || '').toLowerCase();
      const matched = terms.filter(term => lower.includes(term) || title.includes(term) || url.includes(term)).length;
      const score = terms.reduce((n, term) => n +
        (title.includes(term) ? 5 : 0) +
        (url.includes(term) ? 3 : 0) +
        (lower.includes(term) ? 1 : 0), 0);
      if (score && matched >= Math.max(1, Math.ceil(terms.length * 0.4))) matches.push({ doc, paragraph, score, matched });
    }
  }
  matches.sort((a, b) => b.score - a.score || b.matched - a.matched || Date.parse(b.doc.fetchedAt || 0) - Date.parse(a.doc.fetchedAt || 0));
  const results = [];
  const usedDocs = new Set();
  for (const match of matches) {
    if (usedDocs.has(match.doc.url)) continue;
    usedDocs.add(match.doc.url);
    results.push({ ...match.doc, excerpt: match.paragraph.slice(0, 1500) });
    if (results.length >= limit) break;
  }
  return results;
}
