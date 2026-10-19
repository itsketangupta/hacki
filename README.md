# Hacki

Hacki is an AI assistant for the Hack Club community. It answers questions about Hack Club programs, YSWS opportunities, team members, tools, and Slack announcements, with source links and data snapshot dates where available.

The web client uses **React** and **Vite**. An **Express** server provides the authenticated API, Hack Club sign-in, SQLite chat storage, data collectors, and optional Slack bot. AI and Slack credentials stay on the server in environment variables; the browser never receives those secrets.

## Features

- Responsive React chat interface with Markdown, source citations, and streaming-style replies.
- System, light, and dark themes.
- Hack Club OAuth sign-in and account-scoped SQLite chat history synced across devices.
- Retrieval from the Hack Club team directory, live YSWS catalog, Slack bulletins, and cached official Hack Club pages and repositories.
- Relevance-ranked Slack and official-page search, with named YSWS status questions refreshed from the catalog before answering.
- Evidence-first answers that distinguish official pages from community Slack posts and surface uncertainty when sources are stale or unavailable.
- If the AI service is down, Hacki reports the outage and keeps available citations instead of returning stale canned answers.
- A searchable Opportunity Finder for recent Slack roles, program launches, events, bounties, and other calls for participation, with original post links and dates.
- Source snapshot dates for time-sensitive answers.
- Optional Slack bot replies to direct messages and explicit mentions.
- Slack replies include source links, use available thread context, and keep short-lived context for follow-up questions in a DM.
- Slack collection from configured announcement, bulletin, YSWS, opportunity, and bounty channel families; bulletin and opportunity channels are processed first, and sync pauses cleanly on rate limits.
- A linked Slack user is invited to `#hacki` only after sending a website chat, DMing Hacki, or mentioning Hacki. Signing in alone does not invite them; the bot does not send a welcome DM or channel post.

## What the Hack Club connection adds

These are Hacki's ten Hack Club-specific capabilities. They depend on the bot's Slack access and the freshness of its collected sources; Hacki labels dates and links back to the original post so people can verify time-sensitive details.

1. Search collected Hack Club announcement and bulletin channels for real posts.
2. Filter the Opportunity Finder for roles, programs, and events.
3. Open the original Slack post from an answer or search result.
4. See when a post was published and whether a listed event date has passed.
5. Search Hack Club's YSWS catalog and distinguish active or newly listed programs.
6. Look up Hack Club team members and roles from the team directory.
7. Retrieve answers from cached official Hack Club pages and repositories.
8. Ask Hacki directly in Slack DMs or with an explicit mention.
9. Let a Slack thread mention use the surrounding thread messages as context.
10. Ask follow-up questions in a DM with temporary, per-conversation context (cleared after 30 minutes of inactivity or a server restart).

This is a Hack Club-focused assistant, not a claim that Hacki is better at every general task. It can only search Slack channels that the bot can access, and its source snapshot may lag behind a new post.

## Architecture

The React/Vite client in `client/` is built into `dist/` and served by Express. The same server provides API routes, Hack Club OAuth, SQLite persistence, data collectors, and the optional Slack integration.

React does not hide API endpoint URLs. Access control belongs in the server, and chat/history routes require a signed-in Hack Club session. AI, Slack, and OAuth secrets stay in server environment variables and are never bundled into the client.

## Requirements

- Node.js 22.12 or newer
- npm
- Credentials for whichever optional integrations you enable (Hack Club AI Gateway, Slack, OAuth)

## Local development

1. Install packages: `npm ci`.
2. Create `.env` from `.env.example` and add the credentials you need.
3. Set the local OAuth callback to `http://localhost:3000/auth/callback`.
4. Run `npm run dev` and open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` and `/auth` to Express on port 3000.
5. Run `npm run sync` to manually refresh the team and YSWS caches.

## Production

Run `npm start` to build the client and start Express. On Hack Club Nest, install dependencies, configure `.env`, then run `pm2 start ecosystem.config.cjs` and `pm2 save`. The PM2 configuration runs `npm start`, so it builds the client before launching Hacki. See [DEPLOY_NEST.md](./DEPLOY_NEST.md) for deployment details.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | Express port (default `3000`) |
| `AI_API_KEY` | Server-side Hack Club AI Gateway key |
| `AI_BASE_URL` | AI Gateway base URL |
| `AI_MODEL` | Model identifier sent to the gateway |
| `HACKCLUB_CLIENT_ID` / `HACKCLUB_CLIENT_SECRET` | Hack Club OAuth credentials |
| `HACKCLUB_REDIRECT_URI` | Registered OAuth callback URL |
| `PUBLIC_BASE_URL` | Public site URL in production |
| `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` | Optional Slack bot and Socket Mode credentials |
| `ENABLE_SLACK_BOT` | Enable or disable Slack bot (requires credentials) |
| `ENABLE_SLACK_SYNC` | Enable or disable announcement collection |
| `SLACK_SYNC_INTERVAL_MS` | Delay between Slack sync batches |
| `SLACK_HACKI_CHANNEL` | Target channel name or ID for interaction-triggered invites |

Never commit `.env` or put credentials in client code. `.env` is excluded by `.gitignore`.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/me` | Current signed-in user |
| `POST` | `/api/chat` | Ask Hacki; authentication required |
| `GET` | `/api/chat/sessions` | List the signed-in user's chats |
| `POST` | `/api/chat/sessions` | Import or create a chat |
| `GET` | `/api/chat/sessions/:key` | Load a chat owned by the signed-in user |
| `PATCH` | `/api/chat/sessions/:key` | Rename a chat |
| `DELETE` | `/api/chat/sessions/:key` | Delete a chat |
| `GET` | `/api/status` | Catalog and collector counts |
| `GET` | `/api/team?q=...` | Search the team cache |
| `GET` | `/api/ysws?q=...` | Search YSWS catalog (`?new=true` for newly opened entries) |
| `GET` | `/api/opportunities?q=...&type=all` | Search cached Slack opportunities; types: `all`, `roles`, `programs`, `events` |
| `POST` | `/api/sync` | Start a background team and YSWS refresh |

## Project layout

- `client/src/App.jsx` — React chat, auth, history, and theme UI
- `client/src/style.css` — Responsive application styling
- `client/public/` — App logos and Hack Club flag
- `src/ai/hackiAgent.js` — Retrieval, answer rules, and AI Gateway client
- `src/auth/` — Hack Club OAuth and sessions
- `src/db/database.js` — SQLite schema and chat persistence
- `src/routes/api.js` — Express API routes
- `src/scrapers/` — Team, YSWS, and official knowledge collectors
- `src/slack/` — Slack bot, channel rules, and bulletin collector
- `data/` — Local data caches and runtime SQLite database
- `dist/` — Generated production client; do not edit by hand

## Data freshness

Team and YSWS caches load at startup and refresh periodically; relevant questions can trigger a coalesced refresh no more than once every five minutes. Named YSWS status answers refresh the catalog before responding and disclose when they fall back to cached data. Official Hack Club pages and repositories are cached and refreshed periodically. Slack announcement dates refer to the original posts; snapshot dates refer to the local cache. Verify time-sensitive program, deadline, and funding details with the linked source.
