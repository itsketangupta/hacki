import { config } from '../config.js';
import { searchTeam, findMemberByName, loadTeam } from '../scrapers/teamScraper.js';
import { getNewYSWS, getActiveYSWS, searchYSWS, loadYSWS } from '../scrapers/yswsScraper.js';
import { getHiringOpportunities, getRecentAnnouncements, searchAnnouncements } from '../slack/announcementsCollector.js';

export async function askHacki(userMessage, conversationHistory = []) {
  const query = String(userMessage || '').trim();
  if (!query) {
    return {
      answer: "Hey! I'm Hacki, your Hack Club AI assistant. Ask me anything about Hack Club, YSWS programs, team members, Teen Contributors, Gappies, free tools like ai.hackclub.com, or Slack opportunities!",
      sources: [],
      suggestedQueries: []
    };
  }

  // 1. Gather relevant context based on intent
  const { contextText, sources, detectedCategory, isOutOfScope } = await buildRAGContext(query);

  // If query is out of scope of Hack Club
  if (isOutOfScope) {
    return {
      answer: "I'm Hacki, the Hack Club assistant! I can only answer questions related to Hack Club, our team members, founders, Gappies, Teen Contributors, YSWS programs, free developer tools, grants, and community opportunities. Please ask about Hack Club or related topics!",
      sources: [
        { title: 'Hack Club', url: 'https://hackclub.com', type: 'general' }
      ],
      suggestedQueries: []
    };
  }

  // If user is asking about Hacki's creator / developer
  if (detectedCategory === 'creator') {
    return {
      answer: `I was created and developed by **Ketan Gupta**!\n\nHere are his verified details and contact info:\n- **Creator:** Ketan Gupta\n- **Slack ID:** \`U093BDEP8FJ\`\n- **Slack Profile:** [Ketan Gupta on Hack Club Slack](https://hackclub.enterprise.slack.com/team/U093BDEP8FJ)\n- **Email:** [mrketanartist13@gmail.com](mailto:mrketanartist13@gmail.com)\n\nFeel free to reach out to Ketan on Hack Club Slack if you have any feedback or ideas for Hacki! 🚀`,
      sources: [
        { title: 'Ketan Gupta (Creator)', url: 'https://hackclub.enterprise.slack.com/team/U093BDEP8FJ', type: 'creator' }
      ],
      suggestedQueries: []
    };
  }

  // If user is asking for help regarding YSWS (orders, fraud review, re-verify)
  if (detectedCategory === 'ysws_help') {
    return {
      answer: `### 📦 YSWS Help, Orders, Fraud Reviews & Re-Verification\n\nIf you need help regarding a **YSWS order, shipping status, fraud review, or ID re-verification**, please ask directly in their designated help channel on Slack!\n\nAs an AI assistant, I don't have access to private fulfillment databases, shipping tracking numbers, or manual review queues. Hack Club staff and community reviewers are active in the help channels and will assist you quickly:\n\n- **General YSWS & Order Questions:** Ask in **\`#ysws-help\`** or **\`#help\`**\n- **ID Verification & Re-Verify Issues:** Ask in **\`#identity-verification\`** or **\`#ysws-help\`**\n- **Specific Program Support:** Check your program's dedicated help channel (e.g. **\`#crescent-help\`**, **\`#horizons\`**, **\`#cider\`**, **\`#boba\`**, **\`#high-seas-help\`**)\n\nPlease post your question in the appropriate channel on Hack Club Slack with your project details or submission email, and the team will help you sort it out! 🚀`,
      sources: [
        { title: 'Hack Club Slack Help Channels (#ysws-help, #help)', url: 'https://hackclub.slack.com', type: 'slack' }
      ],
      suggestedQueries: []
    };
  }

  // 2. Prepare system prompt
  const systemPrompt = `You are Hacki, the official AI assistant and community companion for Hack Club!
Hack Club is the world's largest nonprofit movement of high school and teenage hackers, coders, and makers (founded in 2014 by Zach Latta at age 16, with cofounder Christina Asquith).
Note: Hacki (the AI software itself) was created by Ketan Gupta (@Ketan Gupta, Slack ID: U093BDEP8FJ, email: mrketanartist13@gmail.com).

CRITICAL SCOPE RULE:
You ONLY answer questions related to Hack Club, its team, programs, tools, and community!
In-scope topics:
- Hack Club founders (Zach Latta, Christina Asquith) and board members
- Hack Club team members, HQ staff, Teen Contributors, and community leaders
- Euan Ripper (Teen Contributor at Hack Club HQ — NOTE: Euan is a Teen Contributor, NOT a Gappie)
- Gappies / Gap Year program (teenagers taking a gap year working full-time at Hack Club HQ in Shelburne, Vermont building programs, hardware, and tools)
- YSWS (You Ship, We Ship) programs, hardware grants, project shipping rules, deadlines, prizes
- Hack Club free tools: ai.hackclub.com (free AI endpoint), hackclub.app / Nest (free Linux server shell & bot hosting), hackclub/dns, Sprig, Blot, Scrapbook, HCB
- Hack Club Slack community, channels, reviewer & fulfiller opportunities, bulletin channels, hiring calls
- Hack Club Bank (HCB), High Seas, and all Hack Club initiatives
- Hack Club philosophy ("by teenagers, for teenagers"), high school clubs, hackathons, and culture
- Hacki itself and its creator Ketan Gupta

RULES FOR OUT-OF-SCOPE TOPICS:
If the user asks about anything completely unrelated to Hack Club (general school homework, math equations, chemistry, politics, world leaders, unrelated celebrities, other tech corporations, cooking recipes, sports, etc.):
Politely decline and state:
"I'm Hacki, the Hack Club assistant! I can only answer questions related to Hack Club, our team members, founders, Gappies, YSWS programs, grants, and community opportunities. Please ask about Hack Club or related Hack Club topics!"

CRITICAL RULES FOR SPECIFIC HACK CLUB QUESTIONS:
1. YSWS HELP (ORDERS, SHIPPING, FRAUD REVIEW, RE-VERIFY):
   If user asks about help regarding YSWS (orders, shipping, fraud review, re-verify ID, rejected submission):
   State clearly that Hacki cannot access private order records or fraud review queues, and instruct them:
   "Please ask in their designated help channel on Slack! (e.g. #ysws-help, #help, or the program's specific help channel like #crescent-help, etc.) where HQ staff and fulfillment teams can assist you directly."
2. EUAN RIPPER:
   State clearly that Euan Ripper is a Teen Contributor (he is a Teen Contributor, NOT a Gappie).
   Role: Teen Contributor / Engineering
   Department: Hack Club HQ - Teen Contributors
   Bio: Euan learned to code to automate a boring job at 16. He realised he loved coding and making, so started to teach robotics to younger kids and now is building programs and engineering projects to teach kids all around the world at Hack Club HQ.
   Slack ID: U06T30DNB3L
   Slack Profile: https://hackclub.enterprise.slack.com/team/U06T30DNB3L
   Email: euan@hackclub.com
3. FREE TOOLS HACK CLUB GIVES (ai.hackclub.com, hackclub.app, etc.):
   Explain all the free tools Hack Club gives members:
   - ai.hackclub.com: Free AI endpoint / proxy providing free API access to OpenAI, Claude, Gemini, Llama for teen makers without credit cards.
   - hackclub.app (Nest): Free Linux server shell hosting with SSH, persistent processes, 24/7 Discord/Slack bot & web hosting, and *.hackclub.app subdomains.
   - hackclub/dns: Free subdomains managed via GitHub pull requests.
   - Sprig (sprig.hackclub.com): Free game engine + free physical handheld console shipped upon game submission.
   - Blot (blot.hackclub.com): Free generative art canvas + free physical CNC drawing machine shipped upon art submission.
   - HCB (hcb.hackclub.com): Free 501(c)(3) fiscal sponsorship, bank accounts, and debit cards.
   - Scrapbook (scrapbook.hackclub.com): Community progress showcase.
   - Hack Club Slack (slack.hackclub.com): 50,000+ teen builders.
4. WHERE IS HQ LOCATED:
   Shelburne, Vermont, USA (a historic converted farmhouse where HQ staff and Gappies live and work together).
5. WHO ARE GAPPIES:
   High school graduates and teenagers taking a Gap Year to live and work full-time at Hack Club HQ in Shelburne, Vermont.
   (NOTE: Euan Ripper is a Teen Contributor, NOT a Gappie).
6. HOW TO CONTRIBUTE TO HACK CLUB:
   Join Slack (slack.hackclub.com), contribute to open source on GitHub (github.com/hackclub), volunteer as a YSWS reviewer/fulfiller, lead a high school club (hackclub.com/clubs), organize a hackathon with grants up to $500 (hackclub.com/hackathons), or apply as a Teen Contributor / Gappie.
7. WHAT IS HCB (HACK CLUB BANK):
   Fiscal sponsorship platform for student-led hackathons, clubs, and youth nonprofits with debit cards, 501(c)(3) status, transparent finances.
8. HOW TO HOST A YSWS (IN DETAIL):
   Any teenager in Hack Club can host their very own YSWS program backed by Hack Club funding and logistics!
   - Step 1 (Ideation & Reward): Formulate a creative challenge where teenagers build something original (hardware, games, bots, CLI tools, robotics) and ship it publicly. Choose an exciting physical reward (custom PCB, microcontrollers like RP2040/ESP32, hardware kit, physical swag/stickers, or component grants).
   - Step 2 (Write Spec & Rubric): Write clear submission criteria (what constitutes a valid ship, demo video, open repo, README), anti-fraud & anti-AI-slop rules, reviewer rubric, and unit budget breakdown (cost per reward + international shipping from HQ).
   - Step 3 (Pitch to HQ): Share the proposal on Slack in #ysws or #ysws-drafts, or discuss with HQ staff and Gappies in Shelburne, Vermont.
   - Step 4 (HQ Funding & Logistics): Hack Club officially finances approved community YSWS programs, provides HCB fiscal sponsorship, bulk parts ordering, and worldwide fulfillment support from the Shelburne warehouse.
   - Step 5 (Launch & Run): Launch the landing page (e.g. beest.hackclub.com or GitHub repo), create a dedicated Slack channel (e.g. #beest), recruit reviewers/fulfillers, and launch to 50,000+ teens!
9. HOW TO FIND / JOIN A YSWS CHANNEL (e.g. beest.hackclub.com) & SLACK CHANNEL SEARCH FOR NEW MEMBERS:
   - YSWS Channels: Every YSWS has a dedicated Slack channel matching its name (e.g. beest.hackclub.com -> #beest, crescent.hackclub.com -> #crescent, horizons -> #horizons, blot.hackclub.com -> #blot, sprig.hackclub.com -> #sprig). The project website also lists the channel link.
   - SLACK SEARCH DELAY FOR NEW MEMBERS: When fresh new members join Hack Club Slack and try searching for channels using Slack's search bar (Ctrl+K or channel browser), search results frequently say "Not Found" or "No channels found".
   - Why: Slack's backend indexing takes some time to sync and index channels for brand-new accounts.
   - How search gets enabled: After spending a little time active in Slack—chatting in channels like #welcome, #lounge, #code, introducing yourself, or joining conversations—Slack automatically enables and indexes full channel search for your account!
   - How to join channels immediately without waiting for search:
     1. Type the channel name (e.g. #beest or #channel-name) in any message box or in your own DMs/Saved Messages. Slack will format it as a clickable blue link. Click it and click "Join Channel"!
     2. Use the Slack slash command: type '/join #beest' (or '/join #channel-name') and hit Enter.
     3. Ask in #help or #lounge: say 'Can someone link the #beest channel?' and members will tag it for you.
10. HOW TO VERIFY ID:
   Hack Club verifies identity to ensure all YSWS hardware grants, perks, and prizes go to eligible teenagers (usually ages 13-18 / high schoolers) and prevent fraud.
   Submit a valid, legible government photo ID (Passport, National ID, Driver's License or Learner's Permit) or current school ID with photo and academic year. Legal name and birthdate must match application. If help or re-verify needed, ask in #ysws-help or #identity-verification.
11. HOW TO BECOME A GAPPIE:
    Be an active maker, ship YSWS projects, contribute to open source, watch for openings on Slack and hackclub.com/team, connect with current Gappies/HQ staff, and apply with your portfolio.
12. FORMATTING:
    Use clean GitHub-flavored markdown with bullet points, bold names, and clickable links.
    Do NOT add follow-up suggestions at the end.`;

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
      suggestedQueries: []
    };
  } catch (error) {
    console.error(`[HackiAgent] AI Gateway call failed: ${error.message}. Using structured local fallback.`);
    return fallbackResponse(query, contextText, sources, detectedCategory);
  }
}

export const askHackwire = askHacki;

async function buildRAGContext(query) {
  const cleanQuery = String(query || '').trim();
  const q = cleanQuery.toLowerCase().replace(/\beaun\b/g, 'euan');
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

  // 1. Check YSWS Help / Orders / Fraud / Re-Verify queries
  const isYSWSHelpQuery = /\b(order|orders|shipping|shipment|fraud|fraud review|re-verify|reverify|tracking number|status of my grant|status of my order|status of my shipment)\b/i.test(q) ||
    (/\bhelp\b/i.test(q) && /\b(ysws|order|shipping|grant|hardware|fraud|verify|verification|rejected)\b/i.test(q));

  if (isYSWSHelpQuery && !/\b(what is ysws|how to host|list ysws)\b/i.test(q)) {
    detectedCategory = 'ysws_help';
    sources.push({ title: 'Hack Club Slack Help Channels (#ysws-help, #help)', url: 'https://hackclub.slack.com', type: 'slack' });
    contextParts.push('=== YSWS HELP, ORDERS, FRAUD REVIEW & RE-VERIFICATION RULE ===');
    contextParts.push('CRITICAL RULE: If user asks about help regarding YSWS (like orders, shipping status, fraud review, re-verify ID, or rejected submissions):');
    contextParts.push('Hacki cannot access personal order databases or fraud review queues. Instruct the user to please ask in their designated help channel on Slack!');
    contextParts.push('- General YSWS order/shipping help: #ysws-help or #help');
    contextParts.push('- ID verification / re-verify help: #identity-verification or #ysws-help');
    contextParts.push('- Program-specific help: The dedicated channel for that program (#crescent-help, #horizons, #cider, #boba, #high-seas-help, etc.)');
    contextParts.push('');
  }

  // 2. Check Free Tools queries (ai.hackclub.com, hackclub.app, Nest, etc.)
  const isFreeToolsQuery = /\b(free tool|free tools|tools|ai\.hackclub\.com|hackclub\.app|nest|free ai|free hosting|sprig|blot|scrapbook|dns)\b/i.test(q) &&
    /\b(give|free|tools|provide|offer|ai\.hackclub|hackclub\.app|nest|can we use|what can we use)\b/i.test(q);

  if (isFreeToolsQuery) {
    detectedCategory = 'tools';
    sources.push({ title: 'Hack Club AI Gateway', url: 'https://ai.hackclub.com', type: 'tool' });
    sources.push({ title: 'Hack Club Nest Server Hosting', url: 'https://hackclub.app', type: 'tool' });
    sources.push({ title: 'Hack Club Sprig Game Engine', url: 'https://sprig.hackclub.com', type: 'tool' });
    sources.push({ title: 'Hack Club Blot Art Plotter', url: 'https://blot.hackclub.com', type: 'tool' });

    contextParts.push('=== HACK CLUB FREE TOOLS & PERKS FOR TEENAGERS ===');
    contextParts.push('Hack Club provides teenagers and high schoolers with a massive suite of 100% free developer tools:');
    contextParts.push('1. Hack Club AI (https://ai.hackclub.com): Free AI proxy giving high schoolers free API access to models like GPT-4o, Claude 3.5, Gemini 1.5/2.0, and Llama without needing a credit card.');
    contextParts.push('2. Nest / Hack Club App (https://hackclub.app): Free Linux server accounts with SSH, persistent process management, 24/7 hosting for Discord/Slack bots and APIs, and free *.hackclub.app subdomains.');
    contextParts.push('3. Hack Club DNS (https://github.com/hackclub/dns): Free subdomains (e.g. yourname.hackclub.app) managed via simple GitHub Pull Requests.');
    contextParts.push('4. Sprig (https://sprig.hackclub.com): Free web-based game engine for 2D tile games. Build a game and Hack Club ships you a physical handheld console for free!');
    contextParts.push('5. Blot (https://blot.hackclub.com): Free creative coding vector art canvas. Make generative art and Hack Club ships you a CNC pen-plotter machine for free!');
    contextParts.push('6. Hack Club Bank / HCB (https://hcb.hackclub.com): Free 501(c)(3) fiscal sponsorship, bank accounts, transparency dashboard, and physical debit cards for youth hackathons and clubs.');
    contextParts.push('7. Hack Club Scrapbook (https://scrapbook.hackclub.com): Daily progress-sharing platform where thousands of teen builders post photos and videos of what they make.');
    contextParts.push('8. Hack Club Slack (https://slack.hackclub.com): 50,000+ teenage makers, 24/7 channels, and mentorship.');
    contextParts.push('9. Student Developer Perks: Access to GitHub Student Developer Pack and Figma Education Pro.');
    contextParts.push('');
  }

  // 3. Check Euan queries explicitly (Euan is a Teen Contributor, NOT a Gappie)
  const isEuanQuery = /\b(euan|ripper)\b/i.test(q);
  if (isEuanQuery) {
    detectedCategory = 'team';
    sources.push({ title: 'Hack Club Team Directory', url: 'https://hackclub.com/team', type: 'team' });
    contextParts.push('=== EUAN RIPPER (TEEN CONTRIBUTOR AT HACK CLUB HQ) ===');
    contextParts.push('- Name: Euan Ripper');
    contextParts.push('- Role: Teen Contributor');
    contextParts.push('- Department: Hack Club HQ - Teen Contributors');
    contextParts.push('- Classification: Teen Contributor (IMPORTANT: Euan is a Teen Contributor, NOT a Gappie)');
    contextParts.push('- Bio: Euan learned to code to automate a boring job at 16. He realised he loved coding and making so started to teach robotics to younger kids and now is building programs and engineering projects to teach kids all around the world at Hack Club HQ.');
    contextParts.push('- Slack ID: U06T30DNB3L');
    contextParts.push('- Slack Profile: https://hackclub.enterprise.slack.com/team/U06T30DNB3L');
    contextParts.push('- Email: euan@hackclub.com');
    contextParts.push('- Work & Contributions: Engineering projects, robotics education, teen programs, and hardware initiatives at Hack Club HQ.');
    contextParts.push('');
  }

  // 4. Check Gappie / Gap Year queries
  const isGappieQuery = /\b(gappie|gappies|gap year|gap years|gap)\b/i.test(q);
  if (isGappieQuery) {
    detectedCategory = 'team';
    sources.push({ title: 'Hack Club Gap Year Program (hackclub.com/team)', url: 'https://hackclub.com/team', type: 'team' });
    contextParts.push('=== HACK CLUB GAP YEAR ("GAPPIE") PROGRAM ===');
    contextParts.push('- What is a Gappie? At Hack Club, "Gappies" are teenagers and high school graduates taking a Gap Year to work full-time at Hack Club HQ in Shelburne, Vermont (or remote/hybrid). They build hardware grants, tools, educational platforms, manage shipments, coordinate hackathons, and mentor thousands of teen makers worldwide.');
    contextParts.push('- Current Gappies at Hack Club HQ: Afia Ava, Amber, Anson Chung, Antonio Archer, Armand, Barnav Mitra, Beltran, Brendan Reynard, Cisco, David P, Emma, Fiona, Jenny, Jeremy, Joaquin Schere, Johnathan McPhilbin, Jolly Wang, Julia Do, Kai Pereira, Kartikey Chauhan, Katie, Kaylee Dinh, Lela Harkrader, Lewin Kelly, Liam Newbill, Lola, Louisa, Luke Oldenburg, Max H, Meghana Madiraju, Miguel, Mihir Maroju, Nick Do, Ren Leonard, Rudy, Sebastian Hernandez, Selena Nguyen, Sophia Duan.');
    contextParts.push('- Note: Euan Ripper is a Teen Contributor, NOT a Gappie.');
    contextParts.push('');
  }

  // 5. Check How to Become a Gappie
  const isBecomeGappieQuery = /\b(how to become a gappie|how to become gappie|become gappie|become a gappie|apply gappie|apply for gappie|join gap year)\b/i.test(q);
  if (isBecomeGappieQuery) {
    detectedCategory = 'team';
    sources.push({ title: 'Hack Club Gap Year Program', url: 'https://hackclub.com/team', type: 'team' });
    contextParts.push('=== HOW TO BECOME A GAPPIE AT HACK CLUB ===');
    contextParts.push('1. Be an active maker in the community: Ship YSWS projects, contribute to open source, or tinker with hardware.');
    contextParts.push('2. Demonstrate initiative: Run a high school club, organize a hackathon, or volunteer as a YSWS reviewer or fulfiller.');
    contextParts.push('3. Watch for openings: Announcements are posted on Slack (#announcements, #happenings) and at https://hackclub.com/team.');
    contextParts.push('4. Connect with HQ: Reach out to current Gappies and HQ staff on Slack to share your portfolio and projects.');
    contextParts.push('5. Apply: Submit your application highlighting your maker passion and what you want to build at HQ in Vermont.');
    contextParts.push('');
  }

  // 6. Check Where is HQ located
  const isHQQuery = /\b(where is hq|hq located|where is hack club hq|headquarters located|shelburne|vermont|location of hq|where is hack club located)\b/i.test(q);
  if (isHQQuery) {
    sources.push({ title: 'Hack Club HQ', url: 'https://hackclub.com', type: 'general' });
    contextParts.push('=== HACK CLUB HEADQUARTERS (HQ) LOCATION ===');
    contextParts.push('- Location: Shelburne, Vermont, USA.');
    contextParts.push('- About HQ: Set in a historic converted farmhouse in Shelburne, VT, where Hack Club staff and Gappies live and work together designing hardware badges, testing kits, packing YSWS grants, coding tools, and running community operations.');
    contextParts.push('');
  }

  // 7. Check How to Contribute
  const isContributeQuery = /\b(how to contribute|how can i contribute|contribute to hack club|contribute hack club|how to help hack club|volunteer at hack club|get involved)\b/i.test(q);
  if (isContributeQuery) {
    sources.push({ title: 'Hack Club Community & Clubs', url: 'https://hackclub.com', type: 'general' });
    contextParts.push('=== HOW TO CONTRIBUTE TO HACK CLUB ===');
    contextParts.push('Ways teenagers and community members can contribute:');
    contextParts.push('1. Join the Slack & Support Peers: Welcome newcomers and help in #lounge, #code, and #hardware (slack.hackclub.com).');
    contextParts.push('2. Open Source Code: Contribute to Hack Club repos on GitHub (https://github.com/hackclub) — websites, Sprig, Blot, Nest, and developer tools.');
    contextParts.push('3. Reviewer & Fulfiller: Join reviewer and fulfillment teams for active YSWS programs (check bulletin channels like #phantom-bulletin, #crescent-bulletin, #ysws-ads).');
    contextParts.push('4. Start a High School Hack Club: Lead a club at your school with Hack Club\'s workshops and support (hackclub.com/clubs).');
    contextParts.push('5. Organize a Hackathon: Run an event with grants up to $500 and free fiscal sponsorship through HCB (hackclub.com/hackathons).');
    contextParts.push('6. Teen Contributors & Gappies: Work on core initiatives with HQ.');
    contextParts.push('');
  }

  // 8. Check HCB (Hack Club Bank)
  const isHCBQuery = /\b(what is hcb|hcb|hack club bank|fiscal sponsor|fiscal sponsorship)\b/i.test(q);
  if (isHCBQuery) {
    sources.push({ title: 'Hack Club Bank (HCB)', url: 'https://hcb.hackclub.com', type: 'hcb' });
    contextParts.push('=== HACK CLUB BANK (HCB) ===');
    contextParts.push('- What is HCB: Hack Club Bank (https://hcb.hackclub.com) is Hack Club\'s 501(c)(3) fiscal sponsorship and financial management platform created specifically for high schoolers, hackathons, robotics teams, and student-led nonprofits.');
    contextParts.push('- Key Features:');
    contextParts.push('  - 501(c)(3) Nonprofit Status: Accept tax-deductible donations and grants from sponsors.');
    contextParts.push('  - Banking & Debit Cards: Physical and virtual debit cards issued to student organizers with custom spending controls.');
    contextParts.push('  - Transparent Financial Ledger: Public transparency mode showing where every dollar comes from and goes.');
    contextParts.push('  - Automated invoicing, donor receipts, check deposits, and legal/tax filings managed by Hack Club.');
    contextParts.push('- Powers hundreds of youth events across the world handling tens of millions of dollars!');
    contextParts.push('');
  }

  // 9. Check How to Host a YSWS
  const isHostYSWSQuery = /\b(how to host a ysws|how to host ysws|host a ysws|host ysws|create a ysws|run a ysws|pitch a ysws|start a ysws)\b/i.test(q);
  if (isHostYSWSQuery) {
    sources.push({ title: 'Hack Club YSWS Catalog', url: 'https://ysws.hackclub.com', type: 'ysws' });
    contextParts.push('=== HOW TO HOST A YSWS (YOU SHIP, WE SHIP) IN DETAIL ===');
    contextParts.push('Any teenager in Hack Club can host their very own YSWS program backed by Hack Club funding, mentorship, and logistics!');
    contextParts.push('Detailed Steps:');
    contextParts.push('1. Ideation & Reward Concept: Formulate an engaging challenge where teenagers build something creative (software, games, hardware, bots, CLI tools) and publicly ship it. Choose an exciting physical reward (custom PCB, microcontrollers like RP2040/ESP32, hardware kit, physical swag/stickers, or component grants).');
    contextParts.push('2. Write a Detailed Proposal (Spec & Rubric):');
    contextParts.push('   - Project criteria and requirements (what constitutes a valid ship, demo video, open-source repo, README).');
    contextParts.push('   - Anti-fraud and anti-AI-slop policies to ensure original teen work.');
    contextParts.push('   - Review rubric for volunteer reviewers.');
    contextParts.push('   - Detailed unit budget breakdown (cost per reward + international packaging and shipping from HQ).');
    contextParts.push('3. Pitch to Hack Club HQ: Share your proposal in Hack Club Slack in #ysws or #ysws-drafts, or discuss with HQ staff and Gappies in Shelburne, Vermont. HQ regularly reviews and approves community-hosted YSWS initiatives.');
    contextParts.push('4. HQ Funding & Logistics Backing: Hack Club officially finances approved community YSWS programs, provides HCB fiscal sponsorship, helps order parts in bulk, and assists with worldwide fulfillment from the HQ farmhouse warehouse.');
    contextParts.push('5. Launch & Community Engagement: Launch the landing page (e.g. beest.hackclub.com or GitHub repo), create a dedicated Slack channel (e.g. #beest), recruit community reviewers and fulfillers, and announce to 50,000+ teens on Slack!');
    contextParts.push('');
  }

  // 10. Check How to Find / Join YSWS Channel (e.g. beest.hackclub.com) & Slack Search for New Members
  const isChannelFindQuery = /\b(channel for|join channel|where is .*channel|where is the channel|channel.*beest|beest|find channel|search.*channel|channel.*not found|search.*not found|slack search)\b/i.test(q);
  if (isChannelFindQuery) {
    sources.push({ title: 'Hack Club Slack Channels', url: 'https://hackclub.slack.com', type: 'slack' });
    contextParts.push('=== HOW TO FIND & JOIN YSWS CHANNELS (e.g. beest.hackclub.com) & SLACK SEARCH GUIDE ===');
    contextParts.push('- Finding YSWS Channels: Every YSWS program has its dedicated channel on Slack named directly after the program:');
    contextParts.push('  - For beest.hackclub.com -> the Slack channel is #beest!');
    contextParts.push('  - For crescent.hackclub.com -> #crescent');
    contextParts.push('  - For blot.hackclub.com -> #blot');
    contextParts.push('  - For sprig.hackclub.com -> #sprig');
    contextParts.push('  - For cider -> #cider, horizons -> #horizons, boba -> #boba, high-seas -> #high-seas');
    contextParts.push('- WHY DOES SLACK CHANNEL SEARCH SAY "NOT FOUND" FOR NEW PEOPLE?');
    contextParts.push('  When brand-new members join the Slack workspace and use the search bar (Ctrl+K or channel browser), Slack often shows "Not found" or "No channels found".');
    contextParts.push('  This happens because Slack has a backend search-indexing delay for brand-new accounts.');
    contextParts.push('  Once you spend some time active in Slack—chatting in channels like #welcome or #lounge, introducing yourself, or participating in conversations—Slack automatically enables full search indexing for your account!');
    contextParts.push('- HOW TO JOIN CHANNELS IMMEDIATELY WITHOUT WAITING FOR SEARCH:');
    contextParts.push('  1. In any message box or in your own DMs/Saved Messages, type the channel name (e.g. #beest) and send it. It will turn into a clickable blue link. Click it, then click "Join Channel"!');
    contextParts.push('  2. Type the slash command: `/join #beest` (or `/join #channel-name`) in any chat and press Enter.');
    contextParts.push('  3. Ask in #help or #lounge: say "Can someone link the channel for beest?" and community members will tag it for you immediately.');
    contextParts.push('');
  }

  // 11. Check How to Verify ID
  const isVerifyIDQuery = /\b(verify id|how to verify id|how do i verify id|id verification|verification|verify identity)\b/i.test(q);
  if (isVerifyIDQuery) {
    sources.push({ title: 'Hack Club Identity Verification & Help', url: 'https://hackclub.slack.com', type: 'slack' });
    contextParts.push('=== HACK CLUB ID VERIFICATION GUIDE ===');
    contextParts.push('- Why verify: Hack Club verifies identity to ensure all YSWS hardware grants, perks, and prizes go to eligible teenagers (usually ages 13-18 / high schoolers) and prevent fraudulent submissions.');
    contextParts.push('- How to verify:');
    contextParts.push('  1. During submission or onboarding, click the verification link provided.');
    contextParts.push('  2. Upload a valid, legible, uncropped photo ID:');
    contextParts.push('     - Government photo ID (Passport, National ID card, Driver\'s License or Learner\'s Permit) OR');
    contextParts.push('     - School ID (Current academic school year clearly visible with photo and name).');
    contextParts.push('  3. Ensure the legal name and birthdate match your Hack Club application.');
    contextParts.push('- Need help or re-verification? If you have issues, delays, or need to re-verify, please ask directly in their designated help channel on Slack (#ysws-help or #identity-verification)!');
    contextParts.push('');
  }

  // 11. Check Hacki / Who are you
  const isHackiQuery = /\b(what is hacki|who is hacki|who are you|what can you do|about hacki|what do you do)\b/i.test(q);
  if (isHackiQuery) {
    sources.push({ title: 'Ketan Gupta (Creator)', url: 'https://hackclub.enterprise.slack.com/team/U093BDEP8FJ', type: 'creator' });
    contextParts.push('=== ABOUT HACKI (HACK CLUB AI ASSISTANT) ===');
    contextParts.push('Hacki is the AI assistant and community companion for Hack Club!');
    contextParts.push('- Created & Developed by: Ketan Gupta (Slack: @Ketan Gupta, Slack ID: U093BDEP8FJ, email: mrketanartist13@gmail.com).');
    contextParts.push('- Capabilities:');
    contextParts.push('  - Provides verified details about Hack Club team members, founders, Teen Contributors, and Gappies.');
    contextParts.push('  - Catalogs active and new YSWS programs, shipping criteria, and grant rules.');
    contextParts.push('  - Discovers reviewer and fulfiller opportunities across Slack bulletin channels.');
    contextParts.push('  - Guides members on free Hack Club tools like ai.hackclub.com, hackclub.app (Nest), HCB, Sprig, and Blot.');
    contextParts.push('  - Welcomes and assists new members across the web interface and Slack.');
    contextParts.push('');
  }

  // 12. Check YSWS queries
  const isYSWSQuery = /\b(ysws|you ship we ship|new ysws|active ysws|program|crescent|clutter|phantom|sprig|onboard|blot|cider|boba|grant|ship|shipping|hardware|deadline|prize)\b/i.test(q);
  const matchedYSWS = await searchYSWS(q);

  if (isYSWSQuery || matchedYSWS.length > 0 || q.includes('what is new') || q.includes('which ysws')) {
    detectedCategory = 'ysws';
    sources.push({ title: 'Hack Club YSWS Catalog', url: 'https://ysws.hackclub.com/', type: 'ysws' });
    sources.push({ title: 'Hack Club Programs', url: 'https://hackclub.com/programs', type: 'programs' });

    const newPrograms = await getNewYSWS();
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

  // 13. Team search (names, roles, founders, staff)
  const matchedMembers = await searchTeam(q);
  const isTeamQuery = isEuanQuery || isGappieQuery || matchedMembers.length > 0 || /\b(founder|founders|who is|who are|team|staff|gappie|role|lead|president|director|zach|christina)\b/i.test(q);

  if (isTeamQuery && matchedMembers.length > 0) {
    detectedCategory = 'team';
    sources.push({ title: 'Hack Club Team Directory', url: 'https://hackclub.com/team', type: 'team' });

    contextParts.push('=== HACK CLUB TEAM & ROLES (hackclub.com/team) ===');
    for (const m of matchedMembers.slice(0, 10)) {
      contextParts.push(`- Name: ${m.name}`);
      contextParts.push(`  Role: ${m.role} (${m.department})`);
      if (m.isGappie) contextParts.push(`  Classification: Gap Year (Gappie at Hack Club HQ)`);
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

  // 14. Check Hiring / Reviewer / Fulfiller / Opportunities / Slack
  const isHiringQuery = /\b(hire|hiring|reviewer|reviewing|fulfill|fulfil|fulfiller|fulfillment|organizer|mentor|volunteer|opportunity|opportunities|bulletin|announcement|slack)\b/i.test(q);
  const searchItems = isHiringQuery ? await searchAnnouncements(q) : [];

  if (isHiringQuery || searchItems.length > 0) {
    sources.push({ title: 'Hack Club Slack Bulletin Channels', url: 'https://hackclub.slack.com', type: 'slack' });

    const hiringItems = await getHiringOpportunities();
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

  // 15. General Hack Club knowledge (overview, mission, culture, clubs, hackathons)
  const isGeneralHackClub = /\b(hack club|hackclub|what is hack club|tell me about hack club|about hack club|how does hack club work|what does hack club do|club|clubs|hackathon|hackathons|vermont|shelburne)\b/i.test(q);
  if (isGeneralHackClub || contextParts.length === 0) {
    sources.push({ title: 'Hack Club Website', url: 'https://hackclub.com', type: 'general' });
    contextParts.push('=== ABOUT HACK CLUB ===');
    contextParts.push('- What is Hack Club: Founded in 2014 by Zach Latta (at age 16) and Christina Asquith, Hack Club is a global 501(c)(3) nonprofit movement of high school and teenage hackers, makers, and coders.');
    contextParts.push('- Philosophy & Culture: "By teenagers, for teenagers." Hack Club fosters an authentic hacker culture where high schoolers learn to code, tinker with electronics, build hardware, and ship real projects to the world.');
    contextParts.push('- Headquarters: Shelburne, Vermont.');
    contextParts.push('- Community: 50,000+ teenagers on Hack Club Slack (slack.hackclub.com), and 500+ student-led high school clubs worldwide.');
    contextParts.push('- Core Pillars:');
    contextParts.push('  1. YSWS (You Ship, We Ship): Build a real coding or hardware project and ship it, and Hack Club sends you free hardware, stickers, microcontroller boards, or funding!');
    contextParts.push('  2. Free Tools: ai.hackclub.com (free AI endpoint), hackclub.app / Nest (free Linux server hosting), Sprig, Blot, Scrapbook, HCB.');
    contextParts.push('  3. Gappie Program (Gap Year): High school grads taking a gap year living and working full-time at Hack Club HQ in Vermont to build programs, hardware, and tools.');
    contextParts.push('  4. Hack Club Bank (HCB): Fiscal sponsorship and banking platform empowering youth-led hackathons and nonprofits (hcb.hackclub.com).');
    contextParts.push('  5. Global Hackathons & Events: Epoch, Outernet, Flagship, Wonderdome, High Seas, and hundreds of local high school hackathons supported with grants up to $500+.');
    contextParts.push('- Leadership: Zach Latta (Founder & Executive Director), Christina Asquith (Cofounder & President).');
    contextParts.push('');
  }

  // 16. Strict Out-of-Scope check
  const hasHackClubKeywords = /\b(hack club|hackclub|hacki|hc|hcb|ysws|you ship|gappie|gappies|gap year|gap years|slack|grant|grants|hardware|ship|shipping|crescent|horizons|macondo|phantom|sprig|onboard|blot|cider|boba|arcade|high seas|vermont|shelburne|ketan|zach|latta|christina|asquith|euan|ripper|club|clubs|hackathon|hackathons|maker|bounty|stipend|tools|tool|nest|ai\.hackclub|hackclub\.app|verify|verification|id|contribute|host|where is hq)\b/i.test(q);
  const isGreeting = /^(hi|hello|hey|yo|greetings|help|who are you|what can you do)[\s!?.]*$/i.test(q.trim());
  const hasDomainMatches = matchedMembers.length > 0 || matchedYSWS.length > 0 || searchItems.length > 0 || isCreatorQuery || isGappieQuery || isEuanQuery || isGeneralHackClub || isFreeToolsQuery || isYSWSHelpQuery || isHQQuery || isHCBQuery || isHostYSWSQuery || isVerifyIDQuery || isContributeQuery || isBecomeGappieQuery || isHackiQuery;

  const isExplicitlyOffTopic = /\b(math|solve|integral|derivative|equation|capital of|recipe|bake|cook|cooking|poem|essay|homework|president of|prime minister|football|cricket|fifa|movie|actor|actress|weather in|who is elon|elon musk|donald trump|joe biden|barack obama|currency of|population of|distance to|speed of light)\b/i.test(q);

  const isOutOfScope = isExplicitlyOffTopic || (!hasHackClubKeywords && !isGreeting && !hasDomainMatches);

  return {
    contextText: contextParts.join('\n'),
    sources,
    detectedCategory,
    isOutOfScope
  };
}

function fallbackResponse(query, contextText, sources, category) {
  const q = String(query || '').toLowerCase().replace(/\beaun\b/g, 'euan');

  if (category === 'creator') {
    return {
      answer: `I was proudly created and developed by **Ketan Gupta**!\n\nHere are his contact and profile details:\n- **Creator:** Ketan Gupta\n- **Slack ID:** \`U093BDEP8FJ\`\n- **Slack Profile:** [Ketan Gupta on Hack Club Slack](https://hackclub.enterprise.slack.com/team/U093BDEP8FJ)\n- **Email:** \`mrketanartist13@gmail.com\``,
      sources,
      suggestedQueries: []
    };
  }

  if (category === 'ysws_help' || q.includes('order') || q.includes('fraud') || q.includes('re-verify') || q.includes('reverify')) {
    return {
      answer: `### 📦 YSWS Help, Orders, Fraud Reviews & Re-Verification\n\nIf you need help regarding a **YSWS order, shipping status, fraud review, or ID re-verification**, please reach out directly in their designated help channel on Slack!\n\nAs an AI assistant, I don't have access to private fulfillment databases, shipping tracking numbers, or manual review queues. Hack Club staff and community reviewers are active in the help channels and will assist you quickly:\n\n- **General YSWS & Order Questions:** Ask in **\`#ysws-help\`** or **\`#help\`**\n- **ID Verification & Re-Verify Issues:** Ask in **\`#identity-verification\`** or **\`#ysws-help\`**\n- **Specific Program Support:** Check your program's dedicated help channel (e.g. **\`#crescent-help\`**, **\`#horizons\`**, **\`#cider\`**, **\`#boba\`**, **\`#high-seas-help\`**)\n\nPlease post your question in the appropriate channel on Hack Club Slack with your project details or submission email, and the team will help you sort it out! 🚀`,
      sources: [{ title: 'Hack Club Slack Help Channels (#ysws-help, #help)', url: 'https://hackclub.slack.com', type: 'slack' }],
      suggestedQueries: []
    };
  }

  if (q.includes('euan') || q.includes('ripper')) {
    return {
      answer: `### 🛠️ Euan Ripper — Teen Contributor at Hack Club\n\n**Euan Ripper** is a **Teen Contributor** at Hack Club (he is a Teen Contributor, not a Gappie)!\n\n- **Role:** Teen Contributor\n- **Department:** Hack Club HQ - Teen Contributors\n- **Bio:** Euan learned to code to automate a boring job at 16. He realised he loved coding and making, so started to teach robotics to younger kids and now is building programs and engineering projects to teach kids all around the world at Hack Club HQ.\n- **Slack ID:** \`U06T30DNB3L\`\n- **Slack Profile:** [Euan on Hack Club Slack](https://hackclub.enterprise.slack.com/team/U06T30DNB3L)\n- **Email:** [euan@hackclub.com](mailto:euan@hackclub.com)`,
      sources: [{ title: 'Hack Club Team Directory', url: 'https://hackclub.com/team', type: 'team' }],
      suggestedQueries: []
    };
  }

  if (category === 'tools' || q.includes('free tool') || q.includes('ai.hackclub') || q.includes('hackclub.app') || q.includes('nest')) {
    return {
      answer: `### 🛠️ Free Developer Tools Hack Club Gives Teenagers\n\n**YES!** Hack Club provides teenagers and high schoolers with a massive suite of 100% free developer tools and platforms:\n\n1. 🤖 **Hack Club AI ([ai.hackclub.com](https://ai.hackclub.com)):** Free AI proxy/gateway giving members free API access to models like OpenAI GPT-4o, Anthropic Claude, Google Gemini, and Llama for building AI projects without credit cards!\n2. 🖥️ **Nest / Hack Club App ([hackclub.app](https://hackclub.app)):** Free Linux shell accounts with full SSH access, persistent background processes, 24/7 hosting for Discord/Slack bots and APIs, and free \`*.hackclub.app\` subdomains.\n3. 🌐 **Hack Club DNS ([github.com/hackclub/dns](https://github.com/hackclub/dns)):** Free subdomains managed via simple GitHub pull requests.\n4. 🎮 **Sprig ([sprig.hackclub.com](https://sprig.hackclub.com)):** Free game engine for 2D tile games. When you submit a game, Hack Club mails you a custom physical handheld console for free!\n5. 🎨 **Blot ([blot.hackclub.com](https://blot.hackclub.com)):** Free vector art canvas. Make generative code art and Hack Club ships you a custom CNC pen-plotter drawing machine for free!\n6. 💳 **Hack Club Bank / HCB ([hcb.hackclub.com](https://hcb.hackclub.com)):** Free 501(c)(3) fiscal sponsorship, bank accounts, and physical debit cards for youth hackathons and clubs.\n7. 📸 **Scrapbook ([scrapbook.hackclub.com](https://scrapbook.hackclub.com)):** Community progress showcase for teen builders.\n8. 💬 **Hack Club Slack ([slack.hackclub.com](https://slack.hackclub.com)):** 50,000+ teen makers, hardware/coding channels, and mentorship.\n9. 🎓 **Student Perks:** Free GitHub Student Developer Pack and Figma Education Pro.`,
      sources: [
        { title: 'Hack Club AI Gateway', url: 'https://ai.hackclub.com', type: 'tool' },
        { title: 'Hack Club Nest Server Hosting', url: 'https://hackclub.app', type: 'tool' },
        { title: 'Hack Club Sprig Game Engine', url: 'https://sprig.hackclub.com', type: 'tool' }
      ],
      suggestedQueries: []
    };
  }

  if (q.includes('where is hq') || q.includes('hq located') || q.includes('headquarters')) {
    return {
      answer: `### 🌲 Hack Club Headquarters (HQ) Location\n\nHack Club HQ is located in **Shelburne, Vermont, USA**!\n\nHQ is based in a historic converted farmhouse in Shelburne, VT, where Hack Club staff, founders, and Gappies live and work together designing hardware badges, testing kits, packing YSWS grants, coding tools, and running community operations.`,
      sources: [{ title: 'Hack Club HQ', url: 'https://hackclub.com', type: 'general' }],
      suggestedQueries: []
    };
  }

  if (q.includes('hcb') || q.includes('hack club bank')) {
    return {
      answer: `### 💳 What is HCB (Hack Club Bank)?\n\n**HCB (Hack Club Bank)** is Hack Club's **501(c)(3) fiscal sponsorship and financial management platform** built specifically for high schoolers, hackathons, robotics teams, and student-led nonprofits.\n\n- **501(c)(3) Nonprofit Status:** Receive tax-deductible donations and grants from corporate sponsors instantly.\n- **Banking & Debit Cards:** Organizers get physical and virtual debit cards with built-in spending limits and receipt uploads.\n- **Transparent Financial Ledger:** Public transparency mode showing donor transparency in real time.\n- **Invoicing & Taxes Handled:** Automated invoices, check deposits, donor tax receipts, and 990 tax filings managed completely by Hack Club.\n\nLearn more at [https://hcb.hackclub.com](https://hcb.hackclub.com)!`,
      sources: [{ title: 'Hack Club Bank (HCB)', url: 'https://hcb.hackclub.com', type: 'hcb' }],
      suggestedQueries: []
    };
  }

  if (q.includes('host a ysws') || q.includes('host ysws') || (q.includes('host') && q.includes('ysws'))) {
    return {
      answer: `### 🚀 How to Host Your Own YSWS Program (In Detail)\n\nAny teenager in Hack Club can organize and run their very own **YSWS (You Ship, We Ship)** program backed by Hack Club funding, mentorship, and logistics!\n\nHere is the complete step-by-step process:\n\n1. 💡 **Ideation & Reward Concept:**\n   - Formulate a fun, creative challenge where teenagers build something original (hardware, robotics, web apps, games, bots, or developer tools) and ship it publicly.\n   - Pick an enticing physical reward or grant (e.g. custom PCBs, microcontrollers like RP2040/ESP32, hardware dev kits, custom swag/stickers, or component grants).\n\n2. 📝 **Write a Detailed Proposal (Spec & Rubric):**\n   - **Project Criteria:** What qualifies as a valid "ship" (e.g., public GitHub repository, working demo video, clear README, and genuine effort).\n   - **Anti-Fraud & Anti-AI-Slop Policy:** Define rules to prevent plagiarized or low-effort AI-generated projects.\n   - **Review Rubric:** Clear evaluation guidelines for your volunteer review team.\n   - **Budget Breakdown:** Estimate number of participants, unit reward cost, packaging, and worldwide shipping.\n\n3. 🎤 **Pitch to Hack Club HQ:**\n   - Share your proposal in Hack Club Slack in **\`#ysws\`** or **\`#ysws-drafts\`**, or discuss your idea with HQ staff and Gappies in **\`#lounge\`**.\n   - Hack Club leaders and Gappies in Shelburne, Vermont review proposals regularly and approve community-hosted programs!\n\n4. 💰 **HQ Funding & Logistics Backing:**\n   - Once approved, Hack Club officially finances your YSWS program through **Hack Club Bank (HCB)**.\n   - HQ assists with bulk purchasing of hardware parts, tax exemptions, and global shipping fulfillment directly from the Vermont warehouse.\n\n5. 🚀 **Launch & Community Engagement:**\n   - Launch the landing page (e.g. \`beest.hackclub.com\` or GitHub repo).\n   - Create a dedicated Slack channel (e.g. **\`#beest\`**).\n   - Recruit and train community reviewers and fulfillers.\n   - Announce the program to 50,000+ teen hackers on Slack!`,
      sources: [{ title: 'Hack Club YSWS Catalog', url: 'https://ysws.hackclub.com', type: 'ysws' }],
      suggestedQueries: []
    };
  }

  if (q.includes('beest') || (q.includes('channel') && (q.includes('where') || q.includes('join') || q.includes('search') || q.includes('find') || q.includes('not found')))) {
    return {
      answer: `### 🔍 How to Find & Join YSWS Channels (e.g. beest.hackclub.com) & Slack Search Guide\n\n**Where is the channel for a YSWS program?**\nEvery YSWS program has its dedicated channel on Slack named directly after the program:\n- For **[beest.hackclub.com](https://beest.hackclub.com)** ➡️ the Slack channel is **\`#beest\`**!\n- For **crescent.hackclub.com** ➡️ **\`#crescent\`**\n- For **blot.hackclub.com** ➡️ **\`#blot\`**\n- For **sprig.hackclub.com** ➡️ **\`#sprig\`**\n- Other programs follow the same naming: **\`#cider\`**, **\`#horizons\`**, **\`#boba\`**, **\`#high-seas\`**, etc.\n\n---\n\n### ⚠️ Why Does Slack Channel Search Say "Not Found" for New Members?\nWhen **new members** join the Hack Club Slack workspace and use the search bar (\`Ctrl+K\` or channel search), Slack often shows **"Not found"** or **"No channels found"**.\n\n**Why this happens:** Slack has an internal search-indexing delay for brand-new accounts.\n\n**How searching gets enabled:** Once you spend a little time active in Slack—chatting in channels like **\`#welcome\`** or **\`#lounge\`**, introducing yourself, and joining conversations—Slack automatically syncs and enables full channel searching for your account!\n\n---\n\n### ⚡ How to Join Channels Right Now (Without Waiting for Search):\n1. **Type the channel name into any chat:** In your personal "Saved Messages" or in any channel, simply type **\`#beest\`** (or your target channel) and send it. Slack will turn it into a clickable blue link. Click it, then click **"Join Channel"**!\n2. **Use the Slack Slash Command:** Type \`/join #beest\` (or \`/join #channel-name\`) into any message box and hit Enter.\n3. **Ask in \`#help\` or \`#lounge\`:** Send a message like *"Can someone link the channel for beest?"* and community members will tag it for you immediately!`,
      sources: [{ title: 'Hack Club Slack Channels', url: 'https://hackclub.slack.com', type: 'slack' }],
      suggestedQueries: []
    };
  }

  if (q.includes('verify id') || q.includes('verification')) {
    return {
      answer: `### 🪪 How to Verify ID at Hack Club\n\nHack Club verifies identity to ensure all YSWS hardware grants, perks, and prizes go to eligible teenagers (usually ages 13–18 / high school students) and prevent fraud.\n\n**Steps to Verify:**\n1. When submitting to a YSWS program or applying for grants, open the verification link provided.\n2. Upload a clear, uncropped, legible photo of an acceptable ID:\n   - **Government Photo ID:** Passport, National ID card, Driver's License, or Learner's Permit.\n   - **School ID:** Valid school ID card showing your name, photo, and current academic year.\n3. Ensure your legal name and birthdate match your Hack Club application.\n\n⚠️ **Need help or re-verification?** If you have questions about your ID status or need to re-verify, **please ask directly in their designated help channel on Slack (\`#ysws-help\` or \`#identity-verification\`)**!`,
      sources: [{ title: 'Hack Club Slack Help Channels (#ysws-help, #identity-verification)', url: 'https://hackclub.slack.com', type: 'slack' }],
      suggestedQueries: []
    };
  }

  if (q.includes('contribute')) {
    return {
      answer: `### 🤝 How to Contribute to Hack Club\n\nThere are many awesome ways for teenagers and community members to contribute to Hack Club:\n\n1. **Join the Slack & Help Peers:** Hang out in \`#lounge\`, \`#code\`, and \`#hardware\`, answer questions, and welcome new members at [slack.hackclub.com](https://slack.hackclub.com).\n2. **Contribute to Open Source:** All Hack Club projects are open source on GitHub ([github.com/hackclub](https://github.com/hackclub)) — websites, Sprig, Blot, Nest, and developer tools.\n3. **Become a YSWS Reviewer or Fulfiller:** Help review submissions or pack/test hardware for active YSWS programs. Watch bulletin channels like \`#phantom-bulletin\`, \`#crescent-bulletin\`, \`#horizons-bulletin\`, and \`#ysws-ads\` for open calls.\n4. **Start or Lead a High School Hack Club:** Lead a coding club at your school with Hack Club's workshops and support ([hackclub.com/clubs](https://hackclub.com/clubs)).\n5. **Host a Hackathon:** Organize a local or online hackathon with up to $500 in grants and free fiscal sponsorship through Hack Club Bank ([hackclub.com/hackathons](https://hackclub.com/hackathons)).\n6. **Apply as a Teen Contributor or Gappie:** High schoolers and gap year students can work directly with HQ on core initiatives.`,
      sources: [{ title: 'Hack Club Community & Clubs', url: 'https://hackclub.com', type: 'general' }],
      suggestedQueries: []
    };
  }

  if (q.includes('become a gappie') || q.includes('become gappie')) {
    return {
      answer: `### 🎓 How to Become a Gappie (Gap Year at Hack Club HQ)\n\nThe **Gap Year ("Gappie") Program** at Hack Club is an opportunity for high school graduates and teenagers to spend a gap year living and working full-time at **Hack Club HQ in Shelburne, Vermont** (or hybrid/remote)!\n\n**How to Become a Gappie:**\n1. **Be an Active Maker:** Ship impressive YSWS projects, contribute to Hack Club open-source repos on GitHub, or build hardware.\n2. **Demonstrate Initiative:** Organize a hackathon, run a high school club, or volunteer as a YSWS reviewer or fulfiller.\n3. **Watch for Openings:** Gap year openings are announced in Slack (\`#announcements\`, \`#happenings\`) and at [https://hackclub.com/team](https://hackclub.com/team).\n4. **Connect with HQ:** Reach out to current Gappies and HQ staff on Slack to learn about current projects and share your work and portfolio.\n5. **Apply:** When applications open, apply highlighting your maker passion, technical skills, and what you want to build at HQ in Vermont!`,
      sources: [{ title: 'Hack Club Gap Year Program (hackclub.com/team)', url: 'https://hackclub.com/team', type: 'team' }],
      suggestedQueries: []
    };
  }

  if (q.includes('gappie') || q.includes('gap year')) {
    return {
      answer: `### 🚀 Hack Club Gap Year ("Gappie") Program\n\nAt Hack Club, **Gappies** are high school graduates and teenagers taking a Gap Year to live and work full-time at **Hack Club HQ in Shelburne, Vermont** (or remote/hybrid)!\n\nThey build real-world software, design hardware and PCB badges, manage shipments, run global hackathons, and mentor thousands of teen makers worldwide.\n\n**Active Gappies include:**\n- Afia Ava, Amber, Anson Chung, Antonio Archer, Armand, Barnav Mitra, Beltran, Brendan Reynard, Cisco, David P, Emma, Fiona, Jenny, Jeremy, Joaquin Schere, Johnathan McPhilbin, Jolly Wang, Julia Do, Kai Pereira, Kartikey Chauhan, Katie, Kaylee Dinh, Lela Harkrader, Lewin Kelly, Liam Newbill, Lola, Louisa, Luke Oldenburg, Max H, Meghana Madiraju, Miguel, Mihir Maroju, Nick Do, Ren Leonard, Rudy, Sebastian Hernandez, Selena Nguyen, Sophia Duan.\n\n*(Note: Euan Ripper is a Teen Contributor, NOT a Gappie).*`,
      sources: [{ title: 'Hack Club Team Directory', url: 'https://hackclub.com/team', type: 'team' }],
      suggestedQueries: []
    };
  }

  if (q.includes('what is ysws') || q.includes('you ship we ship')) {
    return {
      answer: `### 🚀 What is YSWS? (You Ship, We Ship)\n\n**YSWS** stands for **"You Ship, We Ship"** — Hack Club's flagship initiative for high schoolers and teenagers!\n\n**How it works:**\nWhen you build and publicly ship an original coding or hardware project, Hack Club ships you free hardware, components, PCB grants, stickers, or prizes to your doorstep for free!\n\n**Popular examples of YSWS programs:**\n- **Sprig:** Code a tile game in JS, receive a custom physical handheld console.\n- **Blot:** Create generative vector art, receive a CNC pen-plotter drawing machine.\n- **Onboard:** Design a custom printed circuit board (PCB), receive a $100 manufacturing grant.\n- **Crescent / Horizons / Cider / Boba / High Seas:** Ongoing and seasonal programs offering custom hardware, microcontrollers, and travel/hardware grants.\n\nExplore all active programs at [https://ysws.hackclub.com](https://ysws.hackclub.com)!`,
      sources: [{ title: 'Hack Club YSWS Catalog', url: 'https://ysws.hackclub.com', type: 'ysws' }],
      suggestedQueries: []
    };
  }

  if (q.includes('what is hack club') || q.includes('about hack club') || q.includes('tell me about hack club')) {
    return {
      answer: `### 🦖 What is Hack Club?\n\n**Hack Club** is a global 501(c)(3) nonprofit movement of high school and teenage hackers, makers, and coders, founded in 2014 by **Zach Latta** (at age 16) and **Christina Asquith**!\n\n- **Mission:** "By teenagers, for teenagers." To provide an authentic home for teen makers to learn to code, build hardware, and ship real projects to the world.\n- **Headquarters:** Shelburne, Vermont, USA.\n- **Community:** 50,000+ teenagers on Hack Club Slack ([slack.hackclub.com](https://slack.hackclub.com)), with 500+ student-led high school clubs worldwide.\n- **Core Pillars:**\n  - **YSWS (You Ship, We Ship):** Code a project, get free hardware, stickers, and tools.\n  - **Hack Club Bank (HCB):** Fiscal sponsorship & banking powering hundreds of student-run hackathons and nonprofits.\n  - **Free Tools:** Free AI API ([ai.hackclub.com](https://ai.hackclub.com)), free Linux server hosting ([hackclub.app](https://hackclub.app)), Sprig game engine, Blot art plotter, and more.\n  - **Global Hackathons:** High Seas, Epoch, Outernet, Shipwrecked, and hundreds of local high school hackathons.\n\nWebsite: [https://hackclub.com](https://hackclub.com)`,
      sources: [{ title: 'Hack Club Website', url: 'https://hackclub.com', type: 'general' }],
      suggestedQueries: []
    };
  }

  return {
    answer: `Here is verified information from Hack Club records regarding **"${query}"**:\n\n${contextText.slice(0, 1500)}`,
    sources,
    suggestedQueries: []
  };
}
