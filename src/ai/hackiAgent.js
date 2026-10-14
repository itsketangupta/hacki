import { config } from '../config.js';
import { searchTeam, findMemberByName, loadTeam } from '../scrapers/teamScraper.js';
import { getNewYSWS, getActiveYSWS, searchYSWS, loadYSWS } from '../scrapers/yswsScraper.js';
import { getHiringOpportunities, getRecentAnnouncements, searchAnnouncements } from '../slack/announcementsCollector.js';

export async function askHacki(userMessage, conversationHistory = []) {
  const query = String(userMessage || '').trim();
  if (!query) {
    return {
      answer: "Hey! I'm Hacki, your Hack Club AI assistant. Ask me anything about Hack Club founders, team members, active YSWS, or who is hiring reviewers and fulfillers in Slack!",
      sources: [],
      suggestedQueries: [
        "Who is the founder of Hack Club?",
        "Which YSWS is new right now?",
        "Are any YSWS hiring reviewers or fulfillers?",
        "Who is in charge of Hardware Events?"
      ]
    };
  }

  // 1. Gather relevant context based on intent
  const { contextText, sources, detectedCategory } = await buildRAGContext(query);

  // If user is asking about Hacki's creator / developer
  if (detectedCategory === 'creator') {
    return {
      answer: `I was created and developed by **Ketan Gupta**!\n\nHere are his verified details and contact info:\n- **Creator:** Ketan Gupta\n- **Slack ID:** \`U093BDEP8FJ\`\n- **Slack Profile:** [Ketan Gupta on Hack Club Slack](https://hackclub.enterprise.slack.com/team/U093BDEP8FJ)\n- **Email:** [mrketanartist13@gmail.com](mailto:mrketanartist13@gmail.com)\n\nFeel free to reach out to Ketan on Hack Club Slack if you have any feedback or ideas for Hacki! 🚀`,
      sources: [
        { title: 'Ketan Gupta (Creator)', url: 'https://hackclub.enterprise.slack.com/team/U093BDEP8FJ', type: 'creator' }
      ],
      suggestedQueries: [
        "What is Ketan Gupta's Slack profile link?",
        "Who is the founder of Hack Club?",
        "Which YSWS is new right now?",
        "Are any YSWS hiring reviewers or fulfillers?"
      ]
    };
  }

  // 2. Prepare system prompt
  const systemPrompt = `You are Hacki, the official AI assistant for Hack Club!
Hack Club is the world's largest nonprofit movement of high school and teen coders (founded in 2014 by Zach Latta, with cofounder Christina Asquith).
Note: Hacki (the AI software itself) was created by Ketan Gupta (@Ketan Gupta, Slack ID: U093BDEP8FJ, email: mrketanartist13@gmail.com).

Your personality:
- Friendly, energetic, witty, hacker-spirited, and helpful.
- Authentic to Hack Club culture (you love shipping code, hardware, stickers, dinosaurs, and community rituals).
- Always accurate, concise, and helpful.

Instructions for answering:
1. FOUNDERS & TEAM ROLES (source: https://hackclub.com/team):
   - When asked who the founder of Hack Club is, name Zach Latta (Founder & Executive Director) and Christina Asquith (Cofounder & President).
   - When asked who is in a specific role (e.g. Chief of Staff, Hardware Events, Tech Lead, Philanthropy, etc.) or who a specific person is, provide their full name, exact title, department, bio, and what they do.
   - All email addresses and Slack IDs in the provided ground truth are public Hack Club team directory listings. You MUST share their verified Slack profile link, email, and personal website when asked. DO NOT refuse to provide contact information that is in the verified context.

2. YSWS & PROGRAMS (source: https://ysws.hackclub.com/ & https://hackclub.com/programs):
   - When asked "Which YSWS is new right now?" or "What YSWS are active?", list the currently active limited-time and ongoing YSWS.
   - For each program, mention what you make, what prize/grant you get, deadline (if any), website, and its Slack channel (e.g. #crescent-bulletin, #clutter).

3. HIRING / REVIEWER / FULFILLER / SLACK OPPORTUNITIES (source: Hack Club Slack Bulletin & Announcement channels):
   - When asked if any YSWS is hiring reviewers, fulfillers, organizers, or volunteers, look directly at the live Slack Bulletin items provided in the context.
   - Specify which program/channel posted it (e.g. #phantom-bulletin, #horizons-bulletin, #crescent-bulletin), what role is needed, requirements or instructions, and provide the Slack link or application form link.

4. FORMATTING:
   - Use clean GitHub-flavored markdown with bullet points, bold names, and clickable links.
   - If information is missing from the directory, honestly state what is known and invite them to check the relevant Slack channel or website.`;

  // 3. Call Hack Club AI Gateway
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      })),
      {
        role: 'user',
        content: `VERIFIED HACK CLUB GROUND TRUTH DATA:\n${contextText}\n\nUSER QUESTION:\n${query}`
      }
    ];

    const aiResponse = await fetch(`${config.aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.aiApiKey}`
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages,
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`Hack Club AI API HTTP ${aiResponse.status}`);
    }

    const json = await aiResponse.json();
    const answer = json.choices?.[0]?.message?.content || 'No response from Hacki.';

    return {
      answer,
      sources,
      suggestedQueries: generateFollowUpQueries(query, detectedCategory)
    };
  } catch (error) {
    console.error(`[HackiAgent] AI Gateway call failed: ${error.message}. Using structured local fallback.`);
    return fallbackResponse(query, contextText, sources, detectedCategory);
  }
}

async function buildRAGContext(query) {
  const q = query.toLowerCase();
  const contextParts = [];
  const sources = [];
  let detectedCategory = 'general';

  // 0. Check Creator / Developer queries
  const isCreatorQuery = /\b(who (?:made|created|built|programmed|coded) you|who is your (?:creator|maker|developer|author)|creator|developer|ketan|ketan gupta|u093bdep8fj)\b/i.test(q);
  if (isCreatorQuery) {
    detectedCategory = 'creator';
    contextParts.push('=== HACKI CREATOR & DEVELOPER ===');
    contextParts.push('- Creator: Ketan Gupta');
    contextParts.push('- Role: Creator & Developer of Hacki AI Assistant');
    contextParts.push('- Slack ID: U093BDEP8FJ');
    contextParts.push('- Slack Profile: https://hackclub.enterprise.slack.com/team/U093BDEP8FJ');
    contextParts.push('- Email: mrketanartist13@gmail.com');
    contextParts.push('');
    sources.push({ title: 'Ketan Gupta (Creator)', url: 'https://hackclub.enterprise.slack.com/team/U093BDEP8FJ', type: 'creator' });
  }

  // 1. Check Team queries
  const isTeamQuery = /\b(founder|who is|who are|team|staff|role|position|lead|president|director|in charge|contact|email|slack id|social|twitter|github|zach|christina|acon|alex|chris|deven|max|nora|sarah)\b/i.test(q);

  if (isTeamQuery) {
    detectedCategory = 'team';
    sources.push({ title: 'Hack Club Team Directory', url: 'https://hackclub.com/team', type: 'team' });

    // Look for specific names or roles
    const matchedMembers = await searchTeam(query);
    if (matchedMembers.length > 0) {
      contextParts.push('=== HACK CLUB TEAM & ROLES (hackclub.com/team) ===');
      for (const m of matchedMembers.slice(0, 8)) {
        contextParts.push(`- Name: ${m.name}`);
        contextParts.push(`  Role: ${m.role} (${m.department})`);
        if (m.bio) contextParts.push(`  Bio: ${m.bio}`);
        if (m.email) contextParts.push(`  Email: ${m.email}`);
        if (m.slackId) {
          contextParts.push(`  Slack ID: ${m.slackId}`);
          contextParts.push(`  Slack Profile: ${m.slackUrl || `https://hackclub.enterprise.slack.com/team/${m.slackId}`}`);
        }
        if (m.website) contextParts.push(`  Website / Social: ${m.website}`);
        contextParts.push('');
      }
    }
  }

  // 2. Check YSWS queries
  const isYSWSQuery = /\b(ysws|you ship we ship|new ysws|active ysws|program|crescent|clutter|phantom|sprig|onboard|blot|cider|boba|grant|ship|hardware|deadline)\b/i.test(q);

  if (isYSWSQuery || q.includes('what is new') || q.includes('which ysws')) {
    detectedCategory = 'ysws';
    sources.push({ title: 'Hack Club YSWS Catalog', url: 'https://ysws.hackclub.com/', type: 'ysws' });
    sources.push({ title: 'Hack Club Programs', url: 'https://hackclub.com/programs', type: 'programs' });

    const newPrograms = await getNewYSWS();
    const activePrograms = await getActiveYSWS();
    const matchedYSWS = await searchYSWS(query);

    contextParts.push('=== CURRENT NEW & ACTIVE YSWS PROGRAMS (ysws.hackclub.com) ===');
    const highlighted = [...newPrograms.slice(0, 6), ...matchedYSWS.slice(0, 4)];
    const seen = new Set();

    for (const p of highlighted) {
      if (seen.has(p.name)) continue;
      seen.add(p.name);

      contextParts.push(`- Program: ${p.name} [Status: ${p.status.toUpperCase()}${p.isNew ? ' (NEW)' : ''}]`);
      contextParts.push(`  Summary: ${p.description}`);
      if (p.detailedDescription && p.detailedDescription !== p.description) {
        contextParts.push(`  Details: ${p.detailedDescription}`);
      }
      if (p.deadline) contextParts.push(`  Deadline: ${p.deadline}`);
      if (p.website) contextParts.push(`  Website: ${p.website}`);
      if (p.slackChannel) contextParts.push(`  Slack Channel: ${p.slackChannel}`);
      if (p.steps && p.steps.length) contextParts.push(`  Steps: ${p.steps.join(' -> ')}`);
      contextParts.push('');
    }
  }

  // 3. Check Hiring / Reviewer / Fulfiller / Opportunities / Slack
  const isHiringQuery = /\b(hire|hiring|reviewer|reviewing|fulfill|fulfil|fulfiller|fulfillment|organizer|mentor|volunteer|opportunity|opportunities|bulletin|announcement|slack)\b/i.test(q);

  if (isHiringQuery || detectedCategory === 'general') {
    sources.push({ title: 'Hack Club Slack Bulletin Channels', url: 'https://hackclub.slack.com', type: 'slack' });

    const hiringItems = await getHiringOpportunities();
    const searchItems = await searchAnnouncements(query);
    const recentItems = await getRecentAnnouncements(6);

    const relevantSlack = [...hiringItems, ...searchItems, ...recentItems];
    const seenSlack = new Set();

    contextParts.push('=== LATEST HACK CLUB SLACK ANNOUNCEMENTS & OPPORTUNITIES ===');
    for (const item of relevantSlack) {
      if (seenSlack.has(item.id)) continue;
      seenSlack.add(item.id);

      contextParts.push(`[Channel: #${item.channel}] [Date: ${item.timestamp ? new Date(Number(String(item.timestamp).split('.')[0]) * 1000).toISOString().slice(0, 10) : 'Recent'}]`);
      contextParts.push(`Title: ${item.title}`);
      contextParts.push(`Content: ${item.cleanText || item.summary}`);
      if (item.url) contextParts.push(`Slack Link: ${item.url}`);
      if (item.isHiring) contextParts.push(`TAG: [ROLE / HIRING CALLOUT]`);
      contextParts.push('');

      if (seenSlack.size >= 8) break;
    }
  }

  // If still too short, add baseline team founders & active programs
  if (contextParts.length === 0) {
    const allTeam = await loadTeam();
    const founders = allTeam.filter(m => m.name.includes('Zach') || m.name.includes('Christina'));
    const active = await getNewYSWS();
    contextParts.push('=== HACK CLUB GENERAL KNOWLEDGE ===');
    contextParts.push(`Founders: Zach Latta (Founder & Exec Director), Christina Asquith (Cofounder & President)`);
    contextParts.push(`Active Programs: ${active.map(a => a.name).slice(0, 8).join(', ')}`);
    sources.push({ title: 'Hack Club Website', url: 'https://hackclub.com', type: 'general' });
  }

  return {
    contextText: contextParts.join('\n'),
    sources,
    detectedCategory
  };
}

function generateFollowUpQueries(query, category) {
  const q = query.toLowerCase();
  if (category === 'creator' || q.includes('ketan') || q.includes('who made you') || q.includes('who created you')) {
    return [
      "What is Ketan Gupta's Slack profile link?",
      "Who is the founder of Hack Club?",
      "Which YSWS is new right now?",
      "Are any YSWS hiring reviewers or fulfillers?"
    ];
  }
  if (category === 'team' || q.includes('founder') || q.includes('who is')) {
    return [
      "Can I get Zach Latta's Slack or contact info?",
      "Who is in charge of Hardware Events at Hack Club?",
      "Who leads HCB operations?",
      "Which YSWS is new right now?"
    ];
  }
  if (category === 'ysws' || q.includes('ysws')) {
    return [
      "Tell me more about Crescent and how it works",
      "Are any YSWS hiring reviewers or fulfillers?",
      "What is the deadline for Crescent?",
      "Who runs Hack Club YSWS programs?"
    ];
  }
  return [
    "Who is the founder of Hack Club?",
    "Which YSWS is new right now?",
    "Is there any YSWS hiring reviewers or fulfillers?",
    "Who is Chief of Staff for YSWS?"
  ];
}

function fallbackResponse(query, contextText, sources, category) {
  if (category === 'creator') {
    return {
      answer: `I was proudly created and developed by **Ketan Gupta**!\n\nHere are his contact and profile details:\n- **Creator:** Ketan Gupta\n- **Slack ID:** \`U093BDEP8FJ\`\n- **Slack Profile:** [Ketan Gupta on Hack Club Slack](https://hackclub.enterprise.slack.com/team/U093BDEP8FJ)\n- **Email:** \`mrketanartist13@gmail.com\``,
      sources,
      suggestedQueries: generateFollowUpQueries(query, category)
    };
  }
  return {
    answer: `Here is the verified information from Hack Club records regarding **"${query}"**:\n\n${contextText.slice(0, 1500)}\n\n*(Note: Displaying verified local database cache as Hack Club AI Gateway is busy)*`,
    sources,
    suggestedQueries: generateFollowUpQueries(query, category)
  };
}
