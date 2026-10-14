# 🦖 Hacki — Hack Club AI Assistant

**Hacki** is an AI assistant tailored specifically for the Hack Club community. It provides answers to questions about:

- 👑 **Leadership & Team Directory:** Who the founders are (Zach Latta, Christina Asquith), who is in specific roles (e.g. Chief of Staff, Hardware Lead, Philanthropy, HCB Operations), bios, contact emails, and verified Slack profiles sourced directly from [`https://hackclub.com/team`](https://hackclub.com/team).
- 🚀 **YSWS Programs:** What's new right now, active programs, deadlines, requirements, and dedicated Slack channels sourced from [`https://ysws.hackclub.com/`](https://ysws.hackclub.com/) and [`https://hackclub.com/programs`](https://hackclub.com/programs).
- 📢 **Slack Bulletin & Opportunities:** Who is currently hiring reviewers or fulfillers, open roles, grant drops, and announcement highlights sourced from public Slack bulletin channels (`#phantom-bulletin`, `#crescent-bulletin`, `#horizons-bulletin`, `#happenings`, `#ysws-ads`).
- 🤖 **Hack Club AI Gateway:** Powered by the free Hack Club AI endpoint (`https://ai.hackclub.com/proxy/v1`).
- 💬 **Slack Bot Mode:** Can answer questions directly inside Slack when mentioned (`@Hacki <question>`) or in direct messages.
- 🌐 **Web Interface & Directory:** Single-page web app with prompt suggestions, markdown formatting, source citations, and interactive directories.

---

## 🚀 Quick Start (Local Run)

### 1. Requirements
- Node.js 20 or newer
- npm

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure `.env`
Ensure `.env` exists (already configured with your Hack Club AI API key and Slack credentials). See `.env.example` for reference.

### 4. Sync Initial Data Cache
```bash
npm run sync
```

### 5. Start the Server
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

---

## 🛠️ REST API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/chat` | `POST` | Ask a question (`{ message: "...", history: [...] }`) |
| `/api/status` | `GET` | Get total team members, active YSWS, and announcement counts |
| `/api/team` | `GET` | Search team members by name or role (`?q=hardware`) |
| `/api/ysws` | `GET` | List or search YSWS programs (`?q=crescent` or `?new=true`) |
| `/api/opportunities` | `GET` | Get open reviewer & fulfiller hiring callouts from Slack |
| `/api/sync` | `POST` | Trigger fresh background sync of all scrapers |

---

## 🌐 Deploying to `hackclub.app` (Nest)

Detailed deployment instructions for Hack Club's Nest Linux server are available in **[DEPLOY_NEST.md](./DEPLOY_NEST.md)**.

Quick summary:
```bash
ssh username@nest.hackclub.app
git clone <repo-url> hacki
cd hacki
npm install
pm2 start ecosystem.config.cjs
```

---

## 📁 Project Structure

```
hacki/
├── DEPLOY_NEST.md          # Guide for hosting on hackclub.app (Nest)
├── ecosystem.config.cjs    # PM2 production configuration
├── package.json
├── .env                    # Configured credentials & AI keys
├── .env.example
├── data/
│   ├── team.json           # Indexed Hack Club team directory
│   ├── ysws.json           # Catalog of 230+ YSWS programs
│   └── announcements.json  # Synced Slack bulletin posts & reviewer calls
├── public/
│   ├── index.html          # Web chat UI
│   ├── style.css           # Hack Club aesthetic styles
│   └── app.js             # Interactive frontend client
└── src/
    ├── config.js           # Configuration loader
    ├── index.js            # Express server entry point
    ├── ai/
    │   └── hackiAgent.js   # RAG pipeline & Hack Club AI gateway client
    ├── scrapers/
    │   ├── teamScraper.js  # Scrapes & indexes hackclub.com/team
    │   └── yswsScraper.js  # Parses ysws.hackclub.com catalog & programs
    ├── slack/
    │   ├── announcementsCollector.js # Slack bulletin channel collector
    │   └── slackBot.js     # Slack bot mention and DM responder
    ├── routes/
    │   └── api.js          # REST API endpoints
    └── scripts/
        └── sync-data.js    # Data synchronization CLI script
```
