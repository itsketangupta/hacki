# Hacki

Hacki is an AI assistant for the Hack Club community. It answers questions about Hack Club programs, YSWS opportunities, team members, tools, and Slack announcements, with source links and data snapshot dates where available.

The web client uses **React** and **Vite**. An **Express** server provides Hack Club sign-in, SQLite chat storage, data collectors, and optional Slack bot. Answer generation runs on a local Ollama model; Hacki does not send prompts to a hosted answer API.

## Features

- Responsive React chat interface with Markdown, source citations, and streaming-style replies; Slack replies also stream into their threads as the model responds.
- System, light, and dark themes.
- Hack Club OAuth sign-in and account-scoped SQLite chat history synced across devices.
- Retrieval from the Hack Club team directory, live YSWS catalog, Slack bulletins, and cached official Hack Club pages and repositories.
- Relevance-ranked Slack and official-page search, with named YSWS status questions refreshed from the catalog before answering.
- Evidence-first answers that distinguish official pages from community Slack posts and surface uncertainty when sources are stale or unavailable.
- If the AI service is down, Hacki reports the outage and keeps available citations instead of returning stale canned answers.
- A searchable Opportunity Finder for recent Slack roles, program launches, events, bounties, and other calls for participation, with original post links and dates.
- Source snapshot dates for time-sensitive answers.
- Optional Slack bot replies to direct messages and explicit mentions.
- The AI can select read-only Hack Club, current-channel, web, and public GitHub lookup tools during a reply. In Slack, it can also run requested code or shell/file operations in the user's persistent E2B thread sandbox, prepare sandbox file uploads and requested channel creations, posts, polls, and canvases for confirmation, and prepare requested emails for confirmation. Explicit reaction requests act on the current message.
- Slack replies include source links, put mentions and DMs in message-rooted threads, continue in threads Hacki has joined, and keep short-lived context per DM thread.
- In a channel mention or active thread, `search here: words` searches the latest 200 channel posts the bot can access and returns up to five matching links.
- Optional Exa live web retrieval for general questions, with source URLs included in answers.
- Optional Exa page fetching in Slack with `fetch: https://...`, for reading a specific public web page beyond Hack Club sources.
- Optional real headful Chromium browsing over a remote Chrome DevTools Protocol endpoint; rendered page text is available to the AI as untrusted source material.
- Optional persistent per-thread Python, JavaScript, TypeScript, shell, and file operations in an isolated E2B sandbox, through `run: <code>` or natural-language requests to execute code or work with files.
- Upload files produced in the current Slack thread's E2B sandbox after showing the filename and asking the user to confirm; files are limited to 10 MB.
- Start a temporary public static preview for a project directory in the current thread's E2B sandbox after confirmation. Anyone with the URL can view it while the sandbox remains active.
- Public GitHub repository, issue, and file lookups; optionally prepare a confirmed edit in operator-approved repositories.
- Channel post requests and polls go through an interactive confirmation; `react: emoji` adds a reaction to the current thread’s parent message.
- Optional SMTP email sending from DMs, one-time account welcome emails, and admin broadcasts to members who opted in.
- Persistent Slack reminders through `remind me in 20m to ...` or `remind me every 1h to ...`.
- Private per-user Slack memories through `remember: ...`, `what do you remember?`, and `forget memories` in DMs.
- Per-user custom DM instructions through `instructions: ...` and `clear instructions`.
- Per-user remote Streamable HTTP MCP servers configured in App Home; bearer tokens are encrypted, tools are loaded for that Slack user's requests, and data erasure removes the server configuration.
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

For questions beyond Hack Club, Hacki can use optional live web search and public page fetching, look up public GitHub repositories, and run user-provided code in an isolated sandbox. These general tools complement the Hack Club sources; they do not grant access to private Slack content or arbitrary GitHub accounts.

## Architecture

The React/Vite client in `client/` is built into `dist/` and served by Express. The same server provides API routes, Hack Club OAuth, SQLite persistence, data collectors, and the optional Slack integration.

React does not hide API endpoint URLs. Access control belongs in the server, and chat/history routes require a signed-in Hack Club session. AI, Slack, and OAuth secrets stay in server environment variables and are never bundled into the client.

## Requirements

- Node.js 22.19 or newer (required by the E2B SDK)
- npm
- Ollama installed on the server and a downloaded model (default: `qwen3:8b`)
- Credentials for whichever optional integrations you enable (Slack, OAuth)

## Local development

1. Install packages: `npm ci`.
2. Install Ollama and download the default model: `ollama pull qwen3:8b`.
3. Create `.env` from `.env.example` and add credentials for the integrations you use.
4. Set the local OAuth callback to `http://localhost:3000/auth/callback`.
5. Run `npm run dev` and open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` and `/auth` to Express on port 3000.
6. Run `npm run sync` to manually refresh the team and YSWS caches.

## Production

Run `npm start` to build the client and start Express. On Hack Club Nest, install dependencies, configure `.env`, then run `pm2 start ecosystem.config.cjs` and `pm2 save`. The PM2 configuration runs `npm start`, so it builds the client before launching Hacki. See [DEPLOY_NEST.md](./DEPLOY_NEST.md) for deployment details.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | Express port (default `3000`) |
| `OLLAMA_MODEL` | Locally installed Ollama model (default `qwen3:8b`) |
| `EXA_API_KEY` | Optional Exa key for live web search and public page fetching |
| `BROWSER_CDP_URL` | Optional remote headful Chromium CDP endpoint for JavaScript-rendered pages |
| `GITHUB_TOKEN`, `GITHUB_ALLOWED_OWNERS`, `GITHUB_ALLOWED_SLACK_USERS` | Optional GitHub file edits; both allowlists and a fine-grained Contents read/write token are required; edits require Slack confirmation |
| `SLACK_USER_SECRETS_ENCRYPTION_KEY` | Optional base64 32-byte key used to encrypt MCP bearer tokens stored from Slack App Home |
| `E2B_API_KEY` | Optional E2B API key for isolated per-thread code execution |
| `SMTP_URL` / `MAIL_FROM` | Optional SMTP sender. Welcome emails send once to new accounts; admin broadcasts include only opted-in members. |
| `HACKCLUB_CLIENT_ID` / `HACKCLUB_CLIENT_SECRET` | Hack Club OAuth credentials |
| `HACKCLUB_REDIRECT_URI` | Registered OAuth callback URL |
| `PUBLIC_BASE_URL` | Public site URL in production |
| `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` | Optional Slack bot and Socket Mode credentials |
| `ENABLE_SLACK_BOT` | Enable or disable Slack bot (requires credentials) |
| `ENABLE_SLACK_SYNC` | Enable or disable announcement collection |
| `SLACK_SYNC_INTERVAL_MS` | Delay between Slack sync batches |
| `SLACK_HACKI_CHANNEL` | Target channel name or ID for interaction-triggered invites |

Headful browser access is optional. Set `BROWSER_CDP_URL` to a trusted Chromium DevTools Protocol WebSocket endpoint from a browser hosting service or your own secured browser host. Hacki opens a fresh isolated context per request, allows public HTTPS pages only, and sends requested URLs and page content through that service. Without it, Exa can still search and fetch public pages when `EXA_API_KEY` is configured.

The local Ollama model handles answer generation. `OLLAMA_MODEL` selects a model already installed on the same server. Optional MCP servers are enabled by `SLACK_USER_SECRETS_ENCRYPTION_KEY`.

Users can add up to five remote MCP Streamable HTTP endpoints from App Home, each with an optional bearer token. Hacki checks that an endpoint is HTTPS and resolves to public IP addresses, tests it by listing tools, then refreshes its tool list for that user's Slack requests. Tool calls send the user's request and arguments to that MCP server; use only servers you trust. OAuth-based MCP setup and stdio-only MCP servers are not supported. No additional Slack scopes are required.

Optional GitHub edits are limited to existing text files in public repositories. They require a fine-grained `GITHUB_TOKEN` restricted to the intended repositories with Contents read/write permission, plus comma-separated `GITHUB_ALLOWED_OWNERS` and `GITHUB_ALLOWED_SLACK_USERS` allowlists. The two allowlists work together: only listed Slack accounts can edit repositories belonging to listed owners. Hacki previews the complete replacement and commit message, then commits only after the requesting Slack user confirms; it refuses if the file changed after preview. Keep this token server-side and narrow its repository access. GitHub lookup and file reading remain public and do not need a token.

Slack reminder and memory examples:

- `remind me in 20m to check my project`
- `remind me every 1h to take a break`
- In a DM: `list reminders` or `cancel reminder 12`
- In a DM: `remember: I prefer short answers`
- In a DM: `what do you remember?` or `forget memories`
- In a DM: `instructions: Keep answers concise and use Python examples`
- In a DM: `erase my data` to remove Hacki memories, instructions, reminders, and saved E2B sessions for that Slack user.
- In a mention or DM: `run: print(1 + 1)`
- Ask Hacki to upload a file from the current thread sandbox by path (for example, `./index.html`); it previews the filename and waits for confirmation.
- Ask Hacki to preview or host a project directory from the current thread sandbox; it asks for confirmation before opening a temporary public URL.
- In a mention or DM: `github: facebook/react` or `github issues: facebook/react`
- Ask Hacki to inspect a file in a public GitHub repo, such as `facebook/react` at `packages/react/src/React.js`; it returns up to 12,000 characters with a source link.
- In an approved repository, ask Hacki to replace a file; it displays the complete file proposal and commit message for confirmation before writing.
- In a mention or DM: `fetch: https://example.com/article` to fetch readable text from a public HTTPS page (requires Exa).
- In a mention or DM: `diagram: flowchart TD; A-->B`
- In a channel mention or an active thread: `post: ...`, `poll: question | option 1 | option 2`, or `react: thumbsup`
- Ask Hacki to create a markdown canvas in the current channel; it previews the content for confirmation before creating a channel canvas or appending to the existing one.
- Ask Hacki to create a public or private Slack channel; it shows the normalized name and visibility for confirmation. For private channels, Hacki invites the requesting user.
- In a channel mention or an active thread: `search here: reviewer deadline` searches recent posts in that channel.
- In a DM: `email: person@example.com | Subject | Message body`

Reminders are stored in SQLite and continue after a restart. Recurring reminders keep their original channel or thread. Personal memories are only added to DM prompts and can be erased with `forget memories`.

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
- `src/ai/hackiAgent.js` — Retrieval, answer rules, and local model client
- `src/auth/` — Hack Club OAuth and sessions
- `src/db/database.js` — SQLite schema and chat persistence
- `src/routes/api.js` — Express API routes
- `src/scrapers/` — Team, YSWS, and official knowledge collectors
- `src/slack/` — Slack bot, channel rules, and bulletin collector
- `data/` — Local data caches and runtime SQLite database
- `dist/` — Generated production client; do not edit by hand

## Data freshness

Team and YSWS caches load at startup and refresh periodically; relevant questions can trigger a coalesced refresh no more than once every five minutes. Named YSWS status answers refresh the catalog before responding and disclose when they fall back to cached data. Official Hack Club pages and repositories are cached and refreshed periodically. Slack announcement dates refer to the original posts; snapshot dates refer to the local cache. Verify time-sensitive program, deadline, and funding details with the linked source.
