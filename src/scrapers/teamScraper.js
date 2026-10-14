import fs from 'node:fs/promises';
import { config } from '../config.js';

let cachedTeam = null;

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
  }
];

export async function fetchTeam() {
  console.log('[TeamScraper] Fetching team directory from https://hackclub.com/team...');
  try {
    const res = await fetch('https://hackclub.com/team', {
      headers: {
        'User-Agent': 'HackiBot/1.0 (Hack Club Community Assistant; https://hackclub.com)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from hackclub.com/team`);
    const html = await res.text();

    const membersMap = new Map();

    // 1. Seed with known leadership
    for (const leader of knownLeadership) {
      membersMap.set(leader.name.toLowerCase(), {
        ...leader,
        slackUrl: leader.slackId ? `https://hackclub.enterprise.slack.com/team/${leader.slackId}` : null
      });
    }

    // 2. Extract Next.js RSC push chunks
    const rscMatches = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)/g)];
    let combined = '';
    for (const m of rscMatches) {
      try {
        combined += JSON.parse(`"${m[1]}"`);
      } catch {
        combined += m[1];
      }
    }

    // 3. Extract member JSON objects
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
          membersMap.set(key, {
            name: obj.name.trim(),
            role: obj.role || existing.role || 'Team Member',
            department: obj.department || existing.department || 'Hack Club',
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
    console.log(`[TeamScraper] Successfully indexed ${members.length} team members.`);
    return members;
  } catch (error) {
    console.error(`[TeamScraper] Failed to fetch live team: ${error.message}`);
    // If cache exists, return it
    if (cachedTeam && cachedTeam.length > 0) return cachedTeam;
    return loadTeam();
  }
}

export async function loadTeam() {
  if (cachedTeam && cachedTeam.length > 0) return cachedTeam;
  try {
    const data = await fs.readFile(config.teamFile, 'utf8');
    cachedTeam = JSON.parse(data);
    return cachedTeam;
  } catch {
    // If not on disk yet, fetch it
    return fetchTeam();
  }
}

export async function searchTeam(query = '') {
  const team = await loadTeam();
  const q = query.toLowerCase().trim();
  if (!q) return team.slice(0, 20);

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
  const clean = nameQuery.toLowerCase().trim();
  // Exact match
  const exact = team.find(m => m.name.toLowerCase() === clean);
  if (exact) return exact;

  // First name match or partial match
  const partial = team.find(m => m.name.toLowerCase().includes(clean) || clean.includes(m.name.toLowerCase()));
  return partial || null;
}
