import fs from 'node:fs/promises';
import { config } from '../config.js';

let cachedTeam = null;
let lastFetchAt = 0;
let lastFetchAttemptAt = 0;
let fetchInFlight = null;
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// Core known leadership and founders as reliable baseline & enhancement
const knownLeadership = [
  {
    name: 'Zach Latta',
    role: 'Founder and Executive Director',
    department: 'Leadership & Board',
    staff: true,
    bio: 'Zach founded Hack Club in 2014 after dropping out of high school at 16 to build software used by millions. He is a Thiel Fellow and Forbes 30 Under 30 honoree.',
    slackId: 'U0266FRGP',
    email: 'zach@hackclub.com',
    website: 'https://zachlatta.com',
    avatar: 'https://github.com/zachlatta.png'
  },
  {
    name: 'Christina Asquith',
    role: 'Cofounder and President',
    department: 'Leadership & Board',
    staff: true,
    bio: 'Christina cofounded Hack Club after 20 years as a journalist/war correspondent (reporting from Iraq, Afghanistan and Africa) and founding The Fuller Project, an investigative journalism nonprofit focused on women. She holds an MA in philosophy from London School of Economics and has published 2 nonfiction books.',
    slackId: '',
    email: 'christina@hackclub.com',
    website: '',
    avatar: ''
  },
  {
    name: 'Tom Preston-Werner',
    role: 'Board Member',
    department: 'Board & Advisors',
    staff: false,
    bio: 'Cofounder of GitHub, creator of Gravatar, SemVer, and TOML. Long-time supporter and advisor to Hack Club.',
    slackId: '',
    email: '',
    website: 'https://github.com/mojombo',
    avatar: 'https://github.com/mojombo.png'
  },
  {
    name: 'Quinn Slack',
    role: 'Board Member',
    department: 'Board & Advisors',
    staff: false,
    bio: 'Cofounder and CEO of Sourcegraph / Amp.',
    slackId: '',
    email: '',
    website: 'https://github.com/sqs',
    avatar: 'https://github.com/sqs.png'
  },
  {
    name: 'Ruth Cotter',
    role: 'Board Member',
    department: 'Board & Advisors',
    staff: false,
    bio: 'Senior Vice President and Chief Administrative Officer at AMD.',
    slackId: '',
    email: '',
    website: '',
    avatar: ''
  },
  {
    name: 'John Abele',
    role: 'Board Advisor',
    department: 'Board & Advisors',
    staff: false,
    bio: 'Founder of Boston Scientific.',
    slackId: '',
    email: '',
    website: '',
    avatar: ''
  },
  {
    name: 'Michael Dell',
    role: 'Board Advisor',
    department: 'Board & Advisors',
    staff: false,
    bio: 'Founder, Chairman and CEO of Dell Technologies.',
    slackId: '',
    email: '',
    website: '',
    avatar: ''
  },
  {
    name: 'Euan Ripper',
    role: 'Teen Contributor',
    department: 'Hack Club HQ - Teen Contributors',
    staff: false,
    isGappie: false,
    bio: 'Euan learned to code to automate a boring job at 16. He realised he loved coding and making so started to teach robotics to younger kids and now is building programs and engineering projects to teach kids all around the world at Hack Club HQ.',
    slackId: 'U06T30DNB3L',
    email: 'euan@hackclub.com',
    website: '',
    avatar: 'https://i.ibb.co/nsDXYvPZ/Euan.jpg'
  }
];

export async function fetchTeam({ force = false } = {}) {
  if (fetchInFlight) return fetchInFlight;
  if (!force && lastFetchAttemptAt && Date.now() - lastFetchAttemptAt < MIN_REFRESH_INTERVAL_MS) {
    return cachedTeam || loadTeam();
  }
  lastFetchAttemptAt = Date.now();
  fetchInFlight = refreshTeam();
  try {
    return await fetchInFlight;
  } finally {
    fetchInFlight = null;
  }
}

async function refreshTeam() {
  console.log('[TeamScraper] Fetching team directory from https://hackclub.com/team...');
  try {
    const res = await fetch('https://hackclub.com/team', {
      headers: {
        'User-Agent': 'HackiBot/1.0 (Hack Club Community Assistant; https://hackclub.com)'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from hackclub.com/team`);
    const html = await res.text();

    const membersMap = new Map();

    // 1. Seed with known core team
    for (const leader of knownLeadership) {
      membersMap.set(leader.name.toLowerCase(), {
        ...leader,
        slackUrl: leader.slackId ? `https://hackclub.enterprise.slack.com/team/${leader.slackId}` : null
      });
    }

    // 2. Parse Section Headings from HTML
    const tokens = html.split(/(<h[23][^>]*>.*?<\/h[23]>)/i);
    let currentMain = 'Hack Club HQ';
    let currentSub = '';
    const memberSectionMap = new Map();

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const hMatch = t.match(/<h([23])[^>]*>(.*?)<\/h[23]>/i);
      if (hMatch) {
        const level = hMatch[1];
        const title = hMatch[2].replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim();
        if (level === '2') {
          currentMain = title;
          currentSub = '';
        } else {
          currentSub = title;
        }
      } else {
        const fullSection = currentSub ? `${currentMain} - ${currentSub}` : currentMain;
        const isGappie = fullSection.toLowerCase().includes('gap year') || fullSection.toLowerCase().includes('gappie');
        const names = [...t.matchAll(/aria-label="View ([^"]+)"/g)].map(m => m[1]);
        for (const n of names) {
          memberSectionMap.set(n.toLowerCase().trim(), {
            section: fullSection,
            isGappie
          });
        }
      }
    }

    // 3. Extract Next.js RSC push chunks
    const rscMatches = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)];
    let combined = '';
    for (const m of rscMatches) {
      try {
        combined += JSON.parse(`"${m[1]}"`);
      } catch {
        combined += m[1];
      }
    }

    // 4. Extract member JSON objects
    const objMatches = [...combined.matchAll(/\{"name":\s*"([^"]+)"[\s\S]*?\}/g)];
    for (const m of objMatches) {
      try {
        const obj = JSON.parse(m[0]);
        if (obj.name && (obj.role || obj.department || obj.slackId)) {
          const key = obj.name.toLowerCase().trim();
          const cleanEmail = obj.email
            ? (obj.email.includes('@') ? obj.email : `${obj.email}@hackclub.com`)
            : '';
          const slackUrl = obj.slackId
            ? `https://hackclub.enterprise.slack.com/team/${obj.slackId}`
            : null;

          const existing = membersMap.get(key) || {};
          const sec = memberSectionMap.get(key) || {};
          const isEuan = key === 'euan ripper' || key === 'euan' || key === 'eaun ripper' || key === 'eaun';
          const isGappie = isEuan ? false : Boolean(sec.isGappie || existing.isGappie || (obj.role && obj.role.toLowerCase().includes('gap')) || (obj.department && obj.department.toLowerCase().includes('gap')));
          const department = isEuan
            ? 'Hack Club HQ - Teen Contributors'
            : (sec.section || existing.department || obj.department || (isGappie ? 'Hack Club HQ - Gap Year (Gappie)' : 'Hack Club'));
          const role = isEuan ? 'Teen Contributor' : (obj.role || existing.role || 'Team Member');

          membersMap.set(key, {
            name: obj.name.trim(),
            role,
            department,
            isGappie,
            staff: typeof obj.staff === 'boolean' ? obj.staff : existing.staff || false,
            bio: (obj.bio || existing.bio || '').replace(/\\n/g, '\n').replace(/\\"/g, '"').trim(),
            slackId: obj.slackId || existing.slackId || '',
            slackUrl: slackUrl || existing.slackUrl || null,
            email: cleanEmail || existing.email || '',
            website: obj.website || existing.website || '',
            avatar: obj.avatar || existing.avatar || ''
          });
        }
      } catch {}
    }

    const members = Array.from(membersMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Save to data directory
    await fs.mkdir(config.dataDir, { recursive: true });
    await fs.writeFile(config.teamFile, JSON.stringify(members, null, 2), 'utf8');

    cachedTeam = members;
    lastFetchAt = Date.now();
    console.log(`[TeamScraper] Successfully indexed ${members.length} team members.`);
    return members;
  } catch (error) {
    console.error(`[TeamScraper] Failed to fetch live team: ${error.message}`);
    // If cache exists, return it
    if (cachedTeam && cachedTeam.length > 0) return cachedTeam;
    try {
      cachedTeam = JSON.parse(await fs.readFile(config.teamFile, 'utf8'));
      return cachedTeam;
    } catch {
      return [];
    }
  }
}

export async function loadTeam() {
  if (cachedTeam && cachedTeam.length > 0) return cachedTeam;
  try {
    const data = await fs.readFile(config.teamFile, 'utf8');
    cachedTeam = JSON.parse(data);
    try {
      const stat = await fs.stat(config.teamFile);
      lastFetchAt = Math.max(lastFetchAt, stat.mtimeMs);
    } catch {}
    return cachedTeam;
  } catch {
    // If not on disk yet, fetch it
    return fetchTeam();
  }
}

export async function searchTeam(query = '') {
  const team = await loadTeam();
  const q = String(query || '').toLowerCase().trim().replace(/\beaun\b/g, 'euan');
  if (!q) return team.slice(0, 25);

  // If asking about gappies or gap years in general:
  if (/\b(gappie|gappies|gap year|gap years|gap)\b/i.test(q)) {
    const gappies = team.filter(m => m.isGappie || (m.department && m.department.toLowerCase().includes('gap')) || (m.bio && m.bio.toLowerCase().includes('gap')));
    if (gappies.length > 0) return gappies;
  }

  // Remove common conversational query filler words
  const clean = q
    .replace(/\beaun\b/g, 'euan')
    .replace(/\b(who|is|are|tell|me|about|what|does|do|the|a|an|can|you|in|at|on|for|of|hack|club|team|member|person|work|works|role|engineer|developer)\b/gi, ' ')
    .replace(/[^\w\s]/g, ' ')
    .trim();

  const words = clean.split(/\s+/).filter(w => w.length > 1);

  if (words.length > 0) {
    const scored = [];
    for (const member of team) {
      const nameLower = member.name.toLowerCase();
      const roleLower = (member.role || '').toLowerCase();
      const deptLower = (member.department || '').toLowerCase();
      const bioLower = (member.bio || '').toLowerCase();
      let score = 0;

      for (const w of words) {
        const nameParts = nameLower.split(/\s+/);
        if (nameParts.includes(w)) {
          score += 25; // Exact first/last name hit (e.g. "euan", "ripper", "zach")
        } else if (nameLower.includes(w)) {
          score += 15;
        }
        if (roleLower.includes(w)) score += 8;
        if (deptLower.includes(w)) score += 6;
        if (bioLower.includes(w)) score += 3;
        if (member.isGappie && (w === 'gappie' || w === 'gappies')) score += 12;
      }

      if (score > 0) {
        scored.push({ member, score });
      }
    }

    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score);
      return scored.map(s => s.member);
    }
  }

  // Fallback to direct substring search on raw query
  return team.filter(member => {
    return (
      member.name.toLowerCase().includes(q) ||
      member.role.toLowerCase().includes(q) ||
      member.department.toLowerCase().includes(q) ||
      (member.bio && member.bio.toLowerCase().includes(q)) ||
      (member.slackId && member.slackId.toLowerCase() === q)
    );
  });
}

export async function findMemberByName(nameQuery = '') {
  const team = await loadTeam();
  const clean = nameQuery.toLowerCase().trim().replace(/\beaun\b/g, 'euan');
  // Exact match
  const exact = team.find(m => m.name.toLowerCase() === clean);
  if (exact) return exact;

  // First name match or partial match
  const partial = team.find(m => m.name.toLowerCase().includes(clean) || clean.includes(m.name.toLowerCase()));
  return partial || null;
}
