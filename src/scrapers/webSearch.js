import { config } from '../config.js';

/** Search the public web through Exa. Returns empty results when not configured. */
export async function searchWeb(query, limit = 5) {
  if (!config.exaApiKey) return [];
  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.exaApiKey },
    body: JSON.stringify({
      query: String(query || '').slice(0, 500),
      type: 'auto',
      numResults: Math.min(Math.max(Number(limit) || 5, 1), 8),
      contents: { text: { maxCharacters: 1400 }, livecrawl: 'preferred' }
    }),
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`Exa search returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.results || []).filter(item => item.url).map(item => ({
    title: String(item.title || item.url).slice(0, 240),
    url: item.url,
    publishedDate: item.publishedDate || null,
    text: String(item.text || '').slice(0, 1400)
  }));
}

/** Fetch readable text for a public page through Exa rather than opening arbitrary URLs on the bot host. */
export async function fetchWebPage(url) {
  if (!config.exaApiKey) throw new Error('Page fetching is not configured. Add EXA_API_KEY to the server environment.');
  let parsed;
  try { parsed = new URL(String(url || '').trim()); } catch { throw new Error('Give me a valid HTTPS page URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Only public HTTPS page URLs are supported.');
  }
  const response = await fetch('https://api.exa.ai/contents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.exaApiKey },
    body: JSON.stringify({ urls: [parsed.href], text: { maxCharacters: 5000 }, livecrawl: 'preferred' }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Exa page fetch returned HTTP ${response.status}`);
  const data = await response.json();
  const item = (data.results || [])[0];
  if (!item?.text) throw new Error('No readable page text was returned.');
  return {
    title: String(item.title || parsed.hostname).slice(0, 240),
    url: item.url || parsed.href,
    text: String(item.text).slice(0, 5000)
  };
}
