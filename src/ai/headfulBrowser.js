import { chromium } from 'playwright-core';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_PAGE_TEXT = 8_000;

function isPrivateIPv4(host) {
  const octets = host.split('.').map(Number);
  const [a, b, c] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99) || (b === 0 && c === 2))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113);
}

function isPrivateHost(host) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost') ||
      normalized.endsWith('.local') || normalized.endsWith('.internal') ||
      normalized.endsWith('.test') || normalized.endsWith('.example') ||
      normalized.endsWith('.invalid')) return true;
  const version = isIP(normalized);
  if (version === 4) return isPrivateIPv4(normalized);
  if (version === 6) {
    if (normalized.startsWith('::ffff:')) return true;
    const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return firstHextet < 0x2000 || firstHextet > 0x3fff || normalized.startsWith('2001:db8:');
  }
  return false;
}

function validatePublicUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Give me a valid HTTPS page URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('The browser only opens public HTTPS URLs.');
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error('Private and local network addresses are not available in the browser.');
  }
  return url;
}

/** Connect to an externally hosted, real headful Chromium browser over CDP. */
export async function browseWithHeadfulBrowser(cdpUrl, requestedUrl) {
  if (!cdpUrl) throw new Error('Headful browser is not configured. Set BROWSER_CDP_URL to a browser service CDP endpoint.');
  const url = validatePublicUrl(requestedUrl);
  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpUrl, { timeout: 15_000 });
    // A new context prevents cookies and local storage from leaking between
    // different Hacki users sharing the configured remote browser service.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const checkedHosts = new Map();
      await page.route('**/*', async route => {
        try {
          const requestUrl = new URL(route.request().url());
          if (requestUrl.protocol !== 'https:' || isPrivateHost(requestUrl.hostname)) return route.abort('blockedbyclient');
          let addresses = checkedHosts.get(requestUrl.hostname);
          if (!addresses) {
            addresses = await lookup(requestUrl.hostname.replace(/^\[|\]$/g, ''), { all: true, verbatim: true });
            checkedHosts.set(requestUrl.hostname, addresses);
          }
          if (!addresses.length || addresses.some(item => isPrivateHost(item.address))) return route.abort('blockedbyclient');
          return route.continue();
        } catch {
          return route.abort('blockedbyclient');
        }
      });
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.locator('body').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
      const result = await page.evaluate(() => ({
        title: document.title || location.hostname,
        url: location.href,
        text: document.body?.innerText || ''
      }));
      return {
        title: String(result.title).slice(0, 240),
        url: result.url,
        text: String(result.text).replace(/\n{3,}/g, '\n\n').slice(0, MAX_PAGE_TEXT)
      };
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  } finally {
    // CDP connections are owned by the configured browser service. Disconnect
    // the client without shutting down that shared browser process.
    await browser?.close().catch(() => {});
  }
}
