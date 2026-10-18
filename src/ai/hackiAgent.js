import { config } from '../config.js';
import { searchTeam, findMemberByName, loadTeam, fetchTeam } from '../scrapers/teamScraper.js';
import { getNewYSWS, getActiveYSWS, searchYSWS, loadYSWS, fetchYSWS } from '../scrapers/yswsScraper.js';
import { getHiringOpportunities, getRecentAnnouncements, searchAnnouncements } from '../slack/announcementsCollector.js';
import { searchOfficialKnowledge } from '../scrapers/officialKnowledge.js';

export const SOCIAL_MEDIA_SOURCES = [
  { title: 'Hack Club GitHub', url: 'https://github.com/hackclub', type: 'social' },
  { title: 'Hack Club YouTube', url: 'https://www.youtube.com/@HackClub', type: 'social' },
  { title: 'Hack Club Twitter/X', url: 'https://x.com/hackclub', type: 'social' },
  { title: 'Hack Club Instagram', url: 'https://www.instagram.com/starthackclub', type: 'social' },
  { title: 'Hack Club TikTok', url: 'https://www.tiktok.com/@hackclub', type: 'social' },
  { title: 'Hack Club LinkedIn', url: 'https://www.linkedin.com/company/hackclub', type: 'social' },
  { title: 'Hack Club Bluesky', url: 'https://bsky.app/profile/hackclub.com', type: 'social' },
  { title: 'Hack Club Slack', url: 'https://slack.hackclub.com', type: 'social' },
  { title: 'Hack Club Website', url: 'https://hackclub.com', type: 'social' },
  { title: 'Hack Club Blog', url: 'https://hackclub.com/blog', type: 'social' },
  { title: 'Hack Club Scrapbook', url: 'https://scrapbook.hackclub.com', type: 'social' },
];

export const SOCIAL_MEDIA_TEXT = `### 🌐 Hack Club Social Media & Online Presence

Here's everywhere you can find and follow Hack Club:

- 🐙 **GitHub:** [github.com/hackclub](https://github.com/hackclub) — All open-source projects, tools, and hardware (Sprig, Blot, HCB, etc.)
- 📺 **YouTube:** [youtube.com/@HackClub](https://www.youtube.com/@HackClub) — Event recaps, project showcases, and community highlights
- 🐦 **Twitter / X:** [x.com/hackclub](https://x.com/hackclub) — Announcements, shoutouts, and community news
- 📸 **Instagram:** [instagram.com/starthackclub](https://www.instagram.com/starthackclub) — Photos from events, hackathons, and HQ life
- 🎵 **TikTok:** [tiktok.com/@hackclub](https://www.tiktok.com/@hackclub) — Short videos of builds, events, and teen makers
- 💼 **LinkedIn:** [linkedin.com/company/hackclub](https://www.linkedin.com/company/hackclub) — Professional updates and org news
- 🦋 **Bluesky:** [bsky.app/profile/hackclub.com](https://bsky.app/profile/hackclub.com) — Decentralized social updates
- 💬 **Slack:** [slack.hackclub.com](https://slack.hackclub.com) — Main community hub with 50,000+ teen makers
- 🌐 **Website:** [hackclub.com](https://hackclub.com) — Programs, team, tools, and everything Hack Club
- 📝 **Blog:** [hackclub.com/blog](https://hackclub.com/blog) — Stories, updates, and deep dives from HQ
- 📸 **Scrapbook:** [scrapbook.hackclub.com](https://scrapbook.hackclub.com) — Daily progress posts from teen builders worldwide`;

export const YSWS_MAKE_RUN_SOURCES = [
  { title: '#ask-the-ysws-orgs (Slack Channel)', url: 'https://hackclub.slack.com', type: 'slack' },
  { title: 'YSWS Sponsors List', url: 'https://hackclub.enterprise.slack.com/lists/T0266FRGM/F09M93YCM1Q', type: 'slack' },
  { title: 'Hack Club YSWS Catalog', url: 'https://ysws.hackclub.com', type: 'ysws' }
];

export const YSWS_MAKE_RUN_GUIDE = `### 🚀 How do I make a YSWS?

*"I see lots of people asking in this channel "How do I make a YSWS?", and I'm tired. So, I present to you, my waste of 1 hour in which I was meant to be doing homework, this beautiful guide! — @Swarit"*

---

### 1. 💡 Pitch your idea!
This is the most exciting part, when you get to experiment with ideas and see what the community likes! 🎉

Simply put, we want **YOU** to send your YSWS idea in this channel (**\`#ysws\`**), in this format:

> **You ship:** *(something coding related that the participants ship)*  
> **We ship:** *(something with monetary or sentimental value that is related to the you ship)*

Once you post it, people will react with :upvote: or :downvote: to show how they feel about your idea, and they should respond with constructive criticism in a thread 🧵.

Make sure to participate in the discussion, and once you think your idea is polished enough and has received enough feedback (and upvotes!), you can move to the next step.

> **Side Note:** You should aim for at least **10–15 upvotes** before moving to the next step.

---

### 2. 📢 Create a channel!
Now, you get to make a channel!
- Right-click anywhere in the channel menu on the left side, and create a channel, named after your YSWS! Get creative!
- Reply to the thread where you originally pitched your idea and mention your channel.
- *(Optionally, send it to the channel as well!)*
- Now, as members pile in, welcome them and get busy, as you will be after this step!

---

### 3. 📝 Get some RSVPs!
- Make a form on [build.fillout.com](https://build.fillout.com) that asks for their Slack username, as a way to verify that they are real.
- Then, you can \`/channel\` ping in your YSWS channel to tell everyone to RSVP!

---

### 4. 🌐 Make a website!
- Cook up a nice looking, creative website that *"blows our socks off"* – \`@ascpixi\` to attract sponsors! Please don't vibecode it!
- Make sure to include a **FAQ section** and a link to your **RSVP form on Fillout**.
- \`/channel\` ping yet again to advertise your fresh website!
- *Tip:* At this point, if your YSWS idea is good, you should be getting a steady stream of new members, so you might want to make a welcomer workflow to tell them to RSVP!

---

### 5. 📣 Advertise
Now, it's time to advertise! 🎉
- Create a fun little description for your YSWS and post it in **\`#ysws\`** & **\`#ysws-ads\`** to get more members! You should be seeing quite a few members piling in once you do this.
- It is generally recommended to do this once or twice a week to try to attract sponsors!
- **Note:** You can only post your advert once a week in **\`#ysws\`**, however, you can submit your event to **\`@YSWS Submit\`** and it will be included in the weekly update over in **\`#ysws-bulletin\`**.

---

### 6. ⏳ And now we... wait..?
Now, you wait. A potential sponsor will eventually hit you up!
- If you are impatient (:noooovanish:), you can DM sponsors, but some of them might find it annoying.
- To find sponsors to DM, look at this list: [Hack Club Sponsors List](https://hackclub.enterprise.slack.com/lists/T0266FRGM/F09M93YCM1Q)
- That's pretty much it! Once you have a sponsor, they will inform you on how to proceed and what to do next and how you will be accepting submissions!

**Happy YSWSing! :hack-club:** 🦖

---

### ❓ Further Questions?
**\`#ask-the-ysws-orgs\`** is the best place to get feedback / help on YSWSs you're running!`;

export const GETTING_INVOLVED_SOURCES = [
  { title: '#hc-opportunities (Slack Channel)', url: 'https://hackclub.slack.com', type: 'slack' },
  { title: '#bounty & #community-bounties', url: 'https://hackclub.slack.com', type: 'slack' },
  { title: 'Hack Club Community', url: 'https://hackclub.com', type: 'general' }
];

export const GETTING_INVOLVED_GUIDE = `### 🌟 Getting Involved in Hack Club (Canvas by @queso)

*"I've seen a lot of people wondering how to get involved in Hack Club, and I thought it would be a good idea to write up a quick canvas on getting involved. I am not affiliated with HQ but here are some insights that I've learned & want to share. — @queso 🦈"*

---

### 📌 Regarding \`#hc-opportunities\`
- **\`#hc-opportunities\`** was created as an entry point to Hack Club and a place where opportunities are compiled.
- **Proactive initiative is key:** Applications in \`#hc-opportunities\` are only meant to be a jumpstart to your Hack Club journey — sometimes you just need a place to get started. They are not intended to replace proactively creating opportunities.
- General guidelines and work ethic matter far more than waiting for an exact plan — it is ultimately up to you to be proactive!

---

### 🚀 Organizers Want to See Proactive People
A lot of people ask how they can join help teams or become a reviewer/organizer of an event. **The answer is simply that you shouldn't wait to be invited into roles; you should proactively pursue them:**

1. **Answer questions before asking to join:**
   - Instead of asking an organizer if you can join a help team, start answering questions in the event channels until people notice you (don't worry, they will!).
   - Make sure your answers are detailed and accurate — a lot of questions can be answered by the README or docs.
2. **When to DM organizers:**
   - You can DM offering to help, but **only for things you cannot directly get involved in without permission** (e.g., *"I noticed that review/fulfillment times were taking a while, I'd love to help out if you're interested!"*).
   - Avoid DMing for roles like support/help teams where you can already proactively help in public channels and show your commitment without being on an official team list.
3. **Be active in the community:**
   - Being active in event channels and Hack Club Slack in general gets you noticed much quicker and shows organizers that you genuinely care about their event and Hack Club!
   - Don't spam people. If an organizer declines an offer, thank them and move on.
   - **Commitment rule:** If you offer to help, ensure you are 100% committed to the role and will not back out or leave responsibilities unfulfilled.

---

### 🎪 Organizing a Major Event
If you're hoping to organize a major event, you have to start somewhere!
- **Launch your own YSWS:** Build experience leading a team by organizing your own YSWS (**\`#ysws\`**) or join an existing team and learn from it.
  - *What's a YSWS?* A "You Ship, We Ship" program where participants ship projects/hours and Hack Club ships them rewards!
  - Leading a team and managing your own program shows your work ethic and organizing ability so other organizers trust you.
  - For your first YSWS, work with people who already have experience that you can learn from.
  - *Pro-tip on web dev:* Hack Club has lots of skilled web developers you can commission to build your site — please don't fully vibecode an entire platform! Check **\`#bounty\`** and **\`#community-bounties\`** to find builders.
- **Major Flagships:** Check \`@sofia\`'s comprehensive guide on running flagship events after you have gained experience running a few YSWS programs or satellite events.

---

### 💼 General Work Ethic Guidelines (Very Important!)

#### 1. 🎯 Quality over Quantity
- Pick a few responsibilities and contribute deeply to them. Don't spread yourself too thin collecting titles without doing quality work.
- Failing to fulfill responsibilities reflects poorly on commitment. Stand out in what you choose to take on.
- Ensure you are passionate about what you contribute to; if not, drop it and find something right for you.

#### 2. 🤝 Delegation, People, & Responsibilities
- When organizing or on a team, delegate tasks based on individual strengths (e.g. web dev, reviewing, logistics). Don't try to do everything yourself.
- Trust your team and avoid micromanaging. A good team functions as a system where everyone does their part.
- **Assign responsibilities rather than titles:** Instead of handing out titles like "lead reviewer", see who does the most reviews and steps up proactively. Giving roles to people who step up yields the highest quality results.

#### 3. 🛡️ Taking Responsibility
- Keep up with your commitments. If you cannot pull your weight, let the team know or step down gracefully. Getting involved shouldn't just be about titles.
- Taking breaks is 100% okay! Just give your team a heads-up in advance so there are no surprises.

#### 4. 📢 Transparency & Communication is Key
- Communicate respectfully and clearly.
- If you can no longer fulfill responsibilities (tests, vacation, burnout), let your organizers/teammates know ASAP.
- When mistakes or miscommunications happen, handle them maturely: identify the issue, discuss how to handle it better next time, and apologize if it was on your end.

#### 5. 💎 Keep a High Standard of Work Quality
- Put in genuine effort and take pride in your work. Holding yourself to high standards builds a reputation as someone organizers can rely on.

#### 6. 💬 Constructive Feedback
- Feedback is meant to improve the project, not attack you personally. Be open-minded and willing to adapt.
- Address issues with teammates privately and respectfully — never publicly shame anyone.
- Remember: **It is you & your team vs. the problem, not you vs. your team.**

#### 7. 💖 Be Kind to People!
- Polite, respectful, and open-minded people make organizers want you on their team.
- This doesn't mean always agreeing — healthy diversity of perspectives and respectful constructive input makes programs better!`;

export const YSWS_SPONSORS_SOURCES = [
  { title: 'Hack Club Team (Gap Year Section)', url: 'https://hackclub.com/team', type: 'team' },
  { title: 'YSWS Sponsors List on Slack', url: 'https://hackclub.enterprise.slack.com/lists/T0266FRGM/F09M93YCM1Q', type: 'slack' },
  { title: '#ask-the-ysws-orgs (Slack Channel)', url: 'https://hackclub.slack.com', type: 'slack' }
];

const HACKATHON_FUNDING_SOURCES = [
  { title: 'Hack Club High School Hackathons', url: 'https://hackclub.com/hackathons', type: 'events' },
  { title: 'HCB Fiscal Sponsorship', url: 'https://hcb.hackclub.com', type: 'finance' }
];

const HACKATHON_FUNDING_ANSWER = `Hack Club has a page for finding high school hackathons, but that page is a directory and does not mean a direct event grant is currently available. The specific **$500 grant for in-person high school hackathons ended on December 31, 2024**, so organizers should not count on that grant now.

Hack Club Bank (HCB) offers fiscal sponsorship and financial tools for eligible organizations; that is different from receiving a direct $500 grant. Check the current [Hack Club hackathons page](https://hackclub.com/hackathons) and [HCB](https://hcb.hackclub.com), or ask Hack Club staff for current event-funding options before budgeting.`;

export const YSWS_SPONSORS_GUIDE = `### 🤝 Who is Sponsoring YSWS Programs?

At Hack Club, community YSWS (You Ship, We Ship) programs are sponsored, guided, and coordinated by the **Gap Year team members ("Gappies")** working full-time at **Hack Club HQ in Shelburne, Vermont**, backed by Hack Club's funding and donors!

Here are the names from the **Gap Year section of [hackclub.com/team](https://hackclub.com/team)**:
- **Afia Ava**
- **Anson Chung**
- **Antonio Archer**
- **Armand**
- **Barnav Mitra**
- **Beltran**
- **Brendan Reynard**
- **Cisco**
- **David P**
- **Emma**
- **Fiona**
- **Jenny**
- **Joaquin Schere**
- **Johnathan McPhilbin**
- **Jolly Wang**
- **Kai Pereira**
- **Kartikey Chauhan**
- **Katie**
- **Kaylee Dinh**
- **Lela Harkrader**
- **Lewin Kelly**
- **Liam Newbill**
- **Lola**
- **Luke Oldenburg**
- **Max H**
- **Meghana Madiraju**
- **Miguel**
- **Mihir Maroju**
- **Nick Do**
- **Ren Leonard**
- **Rudy**
- **Sebastian Hernandez**
- **Selena Nguyen**
- **Sophia Duan**

---

### 📋 Sponsor Directory & Resources:
- 🔗 **Live Hack Club Team Directory:** [hackclub.com/team](https://hackclub.com/team) (Check the *Gap Year* section)
- 🔗 **YSWS Sponsors List on Slack:** [Hack Club Slack Sponsors List](https://hackclub.enterprise.slack.com/lists/T0266FRGM/F09M93YCM1Q)
- 💬 **Need advice or feedback on your YSWS?** Check in **\`#ask-the-ysws-orgs\`**!`;

export const SLACK_GUIDE_SOURCES = [
  { title: 'Slack Communication Guide (Canvas)', url: 'https://app.slack.com/client/E09V59WQY1E/unified-files/doc/F07QCJ61T32', type: 'slack' },
  { title: 'Hack Club Slack', url: 'https://slack.hackclub.com', type: 'slack' }
];

export const SLACK_GUIDE_TEXT = `### 💬 Hack Club Slack Communication Guide

Here is the official guide and canvas for how to communicate and use Hack Club Slack:
🔗 **[Hack Club Slack Communication Guide & Canvas](https://app.slack.com/client/E09V59WQY1E/unified-files/doc/F07QCJ61T32)**

---

### 💡 Key Tips for Talking & Communicating in Slack:
1. **Use Threads (🧵):** Keep channels clean and readable by replying in threads to specific messages rather than sending new top-level messages.
2. **Be Polite, Respectful & Kind:** Hack Club is a supportive global community of 50,000+ teen hackers and makers.
3. **Check the README / Search First:** Before asking questions, use Slack search or check pinned canvases and channel topics.
4. **Choose the Right Channels:**
   - **\`#welcome\`** — Say hello and introduce yourself!
   - **\`#lounge\`** — General conversation and hangouts.
   - **\`#code\`** — Programming, debugging, and web development.
   - **\`#hardware\`** — Electronics, PCBs, microcontrollers, and soldering.
   - **\`#help\`** / **\`#ysws-help\`** — Questions about YSWS programs and orders.
   - **\`#identity-verification\`** — Verification and ID issues.
   - **\`#hc-opportunities\`** — Finding volunteer reviewer, fulfiller, and project roles.
   - **\`#ask-the-ysws-orgs\`** — Advice on running your own YSWS.
5. **Direct Messages (DMs):** Only DM organizers when appropriate (e.g. following up on specific private tasks). For general help, post in public channels so others can help and learn too!`;

export async function askHacki(userMessage, conversationHistory = []) {
  const query = String(userMessage || '').trim();
  if (!query) {
    return {
      answer: "Hey! I'm Hacki, your Hack Club AI assistant. Ask me anything about Hack Club, YSWS programs, team members, Teen Contributors, Gappies, free tools like ai.hackclub.com, or Slack opportunities!",
      sources: [],
      suggestedQueries: []
    };
  }

  // Keep ordinary chat and short/slang messages from falling through to the
  // strict topic filter (which otherwise mistakes them for unrelated topics).
  const casualQuery = query.toLowerCase().replace(/[.,!?\s]+$/g, '').trim();
  const isCasualGreeting = /^(?:h+i+|he+y+|hello+|yo+|sup|what'?s up|namaste|salaam|assalamu alaikum)$/i.test(casualQuery);
  const isCasualAcknowledgement = /^(?:ok(?:ay)?|k|kk|alright|got it|thanks?|thank you|ty|thx|lol|lmao|haha+|bruh|oh+h+|ah+h+|fah+h+|okh)$/i.test(casualQuery);
  const isShortAmbiguousMessage = /^(?:op|\?{2,}|huh|hm+|hmm+)$/i.test(casualQuery);
  if (isCasualGreeting || isCasualAcknowledgement || isShortAmbiguousMessage) {
    const usesHinglish = /\b(?:kya|hai|haan|han|bhai|kaise|kaisa|mujhe|mera|meri|bata|batao|samjha|matlab|accha|achha|theek|nahi|nah|karna|karo|chahiye)\b/i.test(query);
    let answer;
    if (isCasualGreeting) {
      answer = usesHinglish ? 'Hey! Kya help chahiye? Hack Club ke baare mein kuch bhi poochho 🙂' : 'Hey! What can I help you with? Ask me anything about Hack Club 🙂';
    } else if (isCasualAcknowledgement) {
      answer = usesHinglish ? 'Theek hai 🙂 Aur kuch poochna ho toh bolo!' : 'Got it 🙂 Let me know what you need.';
    } else {
      answer = usesHinglish ? '“' + query + '” se tumhara kya matlab hai? Thoda context doge, toh main help kar dunga.' : 'I’m here! What do you mean by “' + query + '”? A little more context will help me answer.';
    }
    return { answer, sources: [], suggestedQueries: [] };
  }

  const asksHackathonFunding = /\bhack\s*club\b|\bhackclub\b|\bhc\b/i.test(query) &&
    /\bhackathons?\b/i.test(query) &&
    /\bspon(?:sor|ser|sorship|sored|soring)\b|\bfund(?:ing)?\b|\bgrant\b|\bmoney\b|\bfinancial support\b/i.test(query);
  if (asksHackathonFunding) {
    return {
      answer: HACKATHON_FUNDING_ANSWER,
      sources: HACKATHON_FUNDING_SOURCES,
      suggestedQueries: []
    };
  }

  // Answer named program status questions from the catalog fields directly;
  // don't let the language model infer "new" from an active/limited-time tag.
  const asksProgramStatus = /\b(new|active|ended|closed|open|ongoing|current|available|finished|expired)\b/i.test(query);
  if (asksProgramStatus) {
    const catalogPrograms = await loadYSWS();
    const namedProgram = catalogPrograms.find(program => {
      const name = String(program.name || '').trim();
      return name.length >= 3 && query.toLowerCase().includes(name.toLowerCase());
    });
    if (namedProgram) {
      const notActive = namedProgram.status !== 'active' || !namedProgram.isActive;
      const languageHint = /\b(kya|hai|haan|bhai|kaise|mujhe|bata|batao|nahi|nah|mera|matlab)\b/i.test(query);
      let answer;
      if (notActive) {
        answer = languageHint
          ? `${namedProgram.name} abhi ended hai, new nahi. Catalog${namedProgram.deadline ? ` mein deadline ${namedProgram.deadline} dikh rahi hai` : ' mein iska status ended hai'}.`
          : `${namedProgram.name} is marked as ended in the YSWS catalog, so it isn't a new or active program${namedProgram.deadline ? ` (listed deadline: ${namedProgram.deadline})` : ''}.`;
      } else if (namedProgram.isNew) {
        answer = languageHint
          ? `${namedProgram.name} active hai aur catalog ise recently opened/new mark karta hai.`
          : `${namedProgram.name} is active, and the catalog marks it as newly opened.`;
      } else {
        answer = languageHint
          ? `${namedProgram.name} active hai, lekin catalog ise newly opened/new mark nahi karta.`
          : `${namedProgram.name} is active, but the catalog does not mark it as newly opened.`;
      }
      const sources = [{ title: 'Hack Club YSWS Catalog', url: 'https://ysws.hackclub.com/', type: 'ysws' }];
      if (namedProgram.website) sources.push({ title: `${namedProgram.name} website`, url: namedProgram.website, type: 'ysws' });
      return { answer, sources, suggestedQueries: [] };
    }
  }

  // Always try to refresh live data in background for accuracy
  // (non-blocking — uses cache if fetch fails)
  fetchTeam().catch(() => {});
  fetchYSWS().catch(() => {});

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

  // If user is asking how to make / run / host a YSWS
  if (detectedCategory === 'host_ysws') {
    return {
      answer: YSWS_MAKE_RUN_GUIDE,
      sources: YSWS_MAKE_RUN_SOURCES,
      suggestedQueries: []
    };
  }

  // If user is asking how to get involved in Hack Club / become a member / contribute
  if (detectedCategory === 'get_involved') {
    return {
      answer: GETTING_INVOLVED_GUIDE,
      sources: GETTING_INVOLVED_SOURCES,
      suggestedQueries: []
    };
  }

  // If user is asking who is sponsoring for YSWS
  if (detectedCategory === 'ysws_sponsors') {
    return {
      answer: YSWS_SPONSORS_GUIDE,
      sources: YSWS_SPONSORS_SOURCES,
      suggestedQueries: []
    };
  }

  // If user is asking how to use / communicate in Slack or for Slack guide
  if (detectedCategory === 'slack_guide') {
    return {
      answer: SLACK_GUIDE_TEXT,
      sources: SLACK_GUIDE_SOURCES,
      suggestedQueries: []
    };
  }

  // 2. Prepare system prompt
  const systemPrompt = `You are Hacki, the official AI assistant and community companion for Hack Club!
Current date: ${new Date().toISOString().slice(0, 10)}.
LANGUAGE AND TONE:
- Understand and answer in the language the user uses. For mixed-language messages, follow their mix naturally.
- If the user writes in Hinglish, reply in simple, natural Hinglish using Latin script (Hindi/Urdu words written with English letters), unless they ask for another script or language.
- Keep replies clear and easy to understand. Match the user's level of formality and don't force slang.
- Preserve Hack Club names, URLs, channel names, and technical terms as written. These language rules never change the accuracy or scope rules below.
Hack Club is the world's largest nonprofit movement of high school and teenage hackers, coders, and makers (founded in 2014 by Zach Latta at age 16, with cofounder Christina Asquith).
Note: Hacki (the AI software itself) was created by Ketan Gupta (@Ketan Gupta, Slack ID: U093BDEP8FJ, email: mrketanartist13@gmail.com).

CRITICAL SCOPE RULE:
You answer questions related to Hack Club, its team, programs, tools, and community. Also respond naturally to greetings, thanks, acknowledgements, and brief unclear messages; ask a short clarifying question when needed instead of treating casual chat as off-topic.
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
   Join Slack (slack.hackclub.com), contribute to open source on GitHub (github.com/hackclub), volunteer as a YSWS reviewer/fulfiller, lead a high school club (hackclub.com/clubs), or organize a hackathon. Do not claim a current direct $500 hackathon grant: the specific $500 program for in-person high school hackathons ended December 31, 2024. The current hackathons page is a directory, and HCB fiscal sponsorship is distinct from a direct grant.
7. WHAT IS HCB (HACK CLUB BANK):
   Fiscal sponsorship platform for student-led hackathons, clubs, and youth nonprofits with debit cards, 501(c)(3) status, transparent finances.
8. HOW TO MAKE, RUN, OR HOST A YSWS (THE OFFICIAL COMMUNITY GUIDE BY @SWARIT):
   When a user asks how to make, run, host, start, or pitch a YSWS:
   Present the community guide by @Swarit:
   - Pitch your idea! Send your YSWS idea in #ysws in this format:
     You ship: (something coding related that the participants ship)
     We ship: (something with monetary or sentimental value that is related to the you ship)
     Gather reactions (:upvote: / :downvote:) and constructive feedback in threads. Aim for at least 10-15 upvotes before moving to the next step.
   - Create a channel! Right-click anywhere in the channel menu on the left side, create a channel named after your YSWS, reply to the pitch thread linking it, and welcome incoming members.
   - Get some RSVPs! Make a form on build.fillout.com asking for their Slack username (to verify they are real), then /channel ping in your channel to tell everyone to RSVP.
   - Make a website! Cook up a creative website that "blows our socks off" - @ascpixi to attract sponsors (do not vibecode it!), include a FAQ section and Fillout RSVP link, channel ping to advertise it, and set up a welcomer workflow.
   - Advertise! Post a fun description in #ysws & #ysws-ads once or twice a week. Note: max once a week in #ysws, or submit to @YSWS Submit to be included in the weekly update in #ysws-bulletin.
   - Wait for sponsors! Wait for a sponsor to hit you up, or view the sponsor list (https://hackclub.enterprise.slack.com/lists/T0266FRGM/F09M93YCM1Q). Sponsors guide you on next steps and submissions.
   - Further Questions: #ask-the-ysws-orgs is the best place to get feedback / help on YSWSs you are running!
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
12. GETTING INVOLVED IN HACK CLUB (THE @QUESO CANVAS):
    When someone asks how to get involved, contribute, or become a member:
    Present @queso's canvas:
    - #hc-opportunities is an entry point, but being proactive is essential.
    - Proactive people stand out: don't wait to be invited, answer questions in event channels until people notice you.
    - Only DM organizers for roles you cannot do without permission (e.g. review/fulfillment), don't DM for support where you can help publicly.
    - Organize a YSWS to gain leadership experience before major events. Don't vibecode an entire platform; commission developers via #bounty and #community-bounties.
    - General work ethic: Quality over quantity (don't title-collect), delegate based on strengths, take responsibility (stepping down or taking breaks is fine with notice), communicate transparently, hold high quality standards, accept constructive feedback, and be kind/respectful.
13. WHO IS SPONSORING YSWS:
    Community YSWS programs are sponsored, guided, and coordinated by the Gap Year team ("Gappies") at Hack Club HQ in Shelburne, Vermont.
    Names from hackclub.com/team gap year section:
    Afia Ava, Anson Chung, Antonio Archer, Armand, Barnav Mitra, Beltran, Brendan Reynard, Cisco, David P, Emma, Fiona, Jenny, Joaquin Schere, Johnathan McPhilbin, Jolly Wang, Kai Pereira, Kartikey Chauhan, Katie, Kaylee Dinh, Lela Harkrader, Lewin Kelly, Liam Newbill, Lola, Luke Oldenburg, Max H, Meghana Madiraju, Miguel, Mihir Maroju, Nick Do, Ren Leonard, Rudy, Sebastian Hernandez, Selena Nguyen, Sophia Duan.
    Sponsors list on Slack: https://hackclub.enterprise.slack.com/lists/T0266FRGM/F09M93YCM1Q
14. SLACK COMMUNICATION GUIDE:
    When asking how to use, talk, or communicate in Slack, provide the official canvas link:
    https://app.slack.com/client/E09V59WQY1E/unified-files/doc/F07QCJ61T32
    And explain best practices: reply in threads (🧵), be polite and respectful, search before asking, pick the right channels (#lounge, #code, #hardware, #help, #hc-opportunities), and avoid unsolicited DMs to HQ.
15. HACK CLUB SOCIAL MEDIA & ONLINE PRESENCE:
    When asked about social media, online presence, or where to follow Hack Club:
    - GitHub: https://github.com/hackclub
    - YouTube: https://www.youtube.com/@HackClub
    - Twitter/X: https://x.com/hackclub
    - Instagram: https://www.instagram.com/starthackclub
    - TikTok: https://www.tiktok.com/@hackclub
    - LinkedIn: https://www.linkedin.com/company/hackclub
    - Bluesky: https://bsky.app/profile/hackclub.com
    - Slack: https://slack.hackclub.com
    - Website: https://hackclub.com
    - Blog: https://hackclub.com/blog
    - Scrapbook: https://scrapbook.hackclub.com
16. ACCURACY RULES (CRITICAL — eps from HQ flagged inaccuracy as a problem):
    - ONLY state facts that are present in the VERIFIED HACK CLUB GROUND TRUTH DATA provided below.
    - If you do not have verified data about something, say "I don't have current data on that — check hackclub.com or ask in #lounge on Slack."
    - NEVER invent team member names, roles, emails, or YSWS program details.
    - The direct $500 grant for in-person high school hackathons ended on December 31, 2024. Never present it as open, active, or available now. Hack Club's current hackathons page is a directory; HCB fiscal sponsorship is not the same as a direct grant.
    - NEVER guess deadlines, prizes, or shipping status — only state what is in the data.
    - If data seems outdated, tell the user to verify at hackclub.com or ysws.hackclub.com.
    - Treat announcement dates and event deadlines as important: distinguish when a post was published from whether its opportunity is still open. Never call an opportunity current unless its source clearly supports that and its deadline has not passed.
    - If a source is old, say its date and qualify the answer. Do not turn old announcements or cached data into current claims.
    - For YSWS status, follow the catalog status and deadline fields. "Limited-time" does not mean "new"; call a program new only if the catalog marks it newly opened. Never call an ended, closed, expired, or past-deadline YSWS active or new.
16. FORMATTING:
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
        temperature: 0.1,
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

  // Social media query detection
  const isSocialQuery = /\b(social media|social|twitter|x\.com|instagram|youtube|tiktok|linkedin|github|bluesky|blog|scrapbook|follow|online|where.*find|links|all.*links|website)\b/i.test(q)
    && /\b(hack club|hackclub|hacki|hc)\b/i.test(q);
  if (isSocialQuery) {
    return {
      contextText: SOCIAL_MEDIA_TEXT,
      sources: SOCIAL_MEDIA_SOURCES,
      detectedCategory: 'social',
      isOutOfScope: false
    };
  }

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

  if (isYSWSHelpQuery && !/\b(what is ysws|how to host|how to make|how to run|make a ysws|run a ysws|list ysws)\b/i.test(q)) {
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

  // 7. Check Getting Involved in Hack Club / How to Become a Member / Contribute
  const isGetInvolvedQuery = /\b(getting involved|get involved|how to get involved|how can i get involved|how do i get involved|how to be(?:come)? (?:a )?(?:hc|hack club) member|become (?:a )?(?:hc|hack club) member|be a member|join hack club|how to contribute|how can i contribute|contribute to hack club|contribute hack club|how to help hack club|volunteer at hack club)\b/i.test(q);
  if (isGetInvolvedQuery) {
    return {
      contextText: GETTING_INVOLVED_GUIDE,
      sources: GETTING_INVOLVED_SOURCES,
      detectedCategory: 'get_involved',
      isOutOfScope: false
    };
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

  // 9. Check How to Make / Run / Host a YSWS
  const isHostYSWSQuery = /\b(make|run|host|create|pitch|start|organize|launch)\s+(?:a\s+)?ysws\b/i.test(q) ||
    /\b(how\s+(?:do\s+i|to|can\s+i|can\s+we|do\s+we)\s+(?:make|run|host|create|pitch|start|organize|launch)\s+(?:a\s+)?ysws)\b/i.test(q) ||
    /\bysws\s+(?:guide|creation|making|hosting|running)\b/i.test(q) ||
    (/\bysws\b/i.test(q) && /\b(make|run|host|create|pitch|start|organize)\b/i.test(q) && !/\b(help|order|shipping|fraud|verify)\b/i.test(q));

  if (isHostYSWSQuery) {
    return {
      contextText: YSWS_MAKE_RUN_GUIDE,
      sources: YSWS_MAKE_RUN_SOURCES,
      detectedCategory: 'host_ysws',
      isOutOfScope: false
    };
  }

  // 9b. Check Who is Sponsoring YSWS
  const isYSWSSponsorQuery = /\b(who (?:is |are )?(?:sponsoring|sponsors|sponsor)(?: for)? ysws|who sponsors a ysws|who are (?:the )?ysws sponsors|ysws sponsor|ysws sponsors)\b/i.test(q) ||
    (/\bysws\b/i.test(q) && /\b(sponsor|sponsors|sponsoring)\b/i.test(q) && !/\b(bank|fiscal)\b/i.test(q));

  if (isYSWSSponsorQuery) {
    return {
      contextText: YSWS_SPONSORS_GUIDE,
      sources: YSWS_SPONSORS_SOURCES,
      detectedCategory: 'ysws_sponsors',
      isOutOfScope: false
    };
  }

  // 9c. Check Slack Communication Guide / How to use Slack
  const isSlackGuideQuery = /\b(how to (?:use|communicate in|communicate on|talk in|talk on) slack|how do (?:i|you|we) (?:use|communicate in|talk in) slack|guide for slack|slack guide|guide to slack|communicate in slack|how to talk in slack)\b/i.test(q) ||
    (/\bslack\b/i.test(q) && /\b(guide|communicate|communication|how to use|how to talk)\b/i.test(q));

  if (isSlackGuideQuery) {
    return {
      contextText: SLACK_GUIDE_TEXT,
      sources: SLACK_GUIDE_SOURCES,
      detectedCategory: 'slack_guide',
      isOutOfScope: false
    };
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
    contextParts.push('=== YSWS CATALOG RESULTS (ysws.hackclub.com; each listed status is authoritative) ===');
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
  const searchItems = await searchAnnouncements(q);
  const isSlackQuery = isHiringQuery || /#[a-z0-9_-]+|\b(slack|bulletin|announcements?)\b/i.test(q) || searchItems.length > 0;

  if (isSlackQuery) {
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
      if (item.url && !sources.some(source => source.url === item.url)) {
        sources.push({
          title: `#${item.channel}: ${item.title || 'Slack post'}`,
          url: item.url,
          type: 'slack',
          publishedDate: item.timestamp
            ? new Date(Number(String(item.timestamp).split('.')[0]) * 1000).toISOString().slice(0, 10)
            : null
        });
      }
      if (item.isHiring) contextParts.push(`TAG: [ROLE / HIRING CALLOUT]`);
      contextParts.push('');

      if (seenSlack.size >= 8) break;
    }
  }

  // Search cached pages from official Hack Club websites and repositories.
  // Keep excerpts short and attach the exact page and snapshot date as citations.
  const officialMatches = await searchOfficialKnowledge(q, 3);
  if (officialMatches.length) {
    contextParts.push('=== MATCHING OFFICIAL HACK CLUB KNOWLEDGE SOURCES ===');
    for (const match of officialMatches) {
      contextParts.push(`[Source: ${match.title}] [URL: ${match.url}] [Fetched: ${match.fetchedAt ? match.fetchedAt.slice(0, 10) : 'cached date unknown'}]`);
      contextParts.push(match.excerpt);
      contextParts.push('');
      if (!sources.some(source => source.url === match.url)) {
        sources.push({ title: match.title, url: match.url, type: 'official', fetchedDate: match.fetchedAt ? match.fetchedAt.slice(0, 10) : null });
      }
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
    contextParts.push('  5. Global Hackathons & Events: Epoch, Outernet, Flagship, Wonderdome, High Seas, and a directory of high school hackathons. Do not imply all listed events receive funding.');
    contextParts.push('- Leadership: Zach Latta (Founder & Executive Director), Christina Asquith (Cofounder & President).');
    contextParts.push('');
  }

  // 16. Strict Out-of-Scope check
  const hasHackClubKeywords = /\b(hack club|hackclub|hacki|hc|hcb|ysws|you ship|gappie|gappies|gap year|gap years|slack|grant|grants|hardware|ship|shipping|crescent|horizons|macondo|phantom|sprig|onboard|blot|cider|boba|arcade|high seas|vermont|shelburne|ketan|zach|latta|christina|asquith|euan|ripper|club|clubs|hackathon|hackathons|maker|bounty|stipend|tools|tool|nest|ai\.hackclub|hackclub\.app|verify|verification|id|contribute|host|where is hq)\b/i.test(q);
  const isGreeting = /^(hi|hello|hey|yo|greetings|help|who are you|what can you do)[\s!?.]*$/i.test(q.trim());
  const hasDomainMatches = matchedMembers.length > 0 || matchedYSWS.length > 0 || searchItems.length > 0 || isCreatorQuery || isGappieQuery || isEuanQuery || isGeneralHackClub || isFreeToolsQuery || isYSWSHelpQuery || isHQQuery || isHCBQuery || isHostYSWSQuery || isVerifyIDQuery || isBecomeGappieQuery || isHackiQuery || isGetInvolvedQuery || isYSWSSponsorQuery || isSlackGuideQuery;

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

  if (category === 'host_ysws' || /\b(make|run|host|create|pitch|start)\s+(?:a\s+)?ysws\b/i.test(q) || (q.includes('ysws') && (q.includes('make') || q.includes('run') || q.includes('host') || q.includes('pitch') || q.includes('start')))) {
    return {
      answer: YSWS_MAKE_RUN_GUIDE,
      sources: YSWS_MAKE_RUN_SOURCES,
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

  if (category === 'get_involved' || /\b(getting involved|get involved|become (?:a )?(?:hc |hack club )?member|be a member|contribute)\b/i.test(q)) {
    return {
      answer: GETTING_INVOLVED_GUIDE,
      sources: GETTING_INVOLVED_SOURCES,
      suggestedQueries: []
    };
  }

  if (category === 'ysws_sponsors' || /\b(who (?:is |are )?(?:sponsoring|sponsors)|sponsor.*ysws)\b/i.test(q)) {
    return {
      answer: YSWS_SPONSORS_GUIDE,
      sources: YSWS_SPONSORS_SOURCES,
      suggestedQueries: []
    };
  }

  if (category === 'slack_guide' || (q.includes('slack') && (q.includes('guide') || q.includes('communicate') || q.includes('talk') || q.includes('how to use')))) {
    return {
      answer: SLACK_GUIDE_TEXT,
      sources: SLACK_GUIDE_SOURCES,
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
