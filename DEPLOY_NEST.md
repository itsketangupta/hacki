# Deploying Hacki to Hack Club Nest (hackclub.app)

**Hack Club Nest** (`nest.hackclub.app` / `hackclub.app`) is the community Linux server where Hack Club members can host bots, websites, and APIs.

Follow these steps to deploy Hacki on Nest:

---

### 1. Connect to your Nest account via SSH

Open PowerShell or terminal and SSH into Nest using your username:

```bash
ssh <your-username>@hackclub.app
```

*(If you ever see `disconnect 11` after running `rm -rf`, delete and re-create your container in `hackclub.app/dashboard` for a clean slate).*

---

### 2. Clone Hacki onto Nest

Clone the repository from GitHub:

```bash
git clone https://github.com/itsketangupta/hacki.git
cd hacki
```

---

### 3. Install Dependencies

Install the required npm packages:

Check that Nest is running Node.js 22.19 or newer before installing (required by the E2B SDK):

```bash
node --version
npm install
```

---

### 4. Create and Configure `.env` on Nest

Because `.env` is intentionally kept out of GitHub for security, create it on your Nest server:

```bash
cp .env.example .env
nano .env
```

Fill in your actual API keys and tokens in `.env`:
```env
PORT=3000

# Hack Club AI Gateway
AI_API_KEY=sk-hc-v1-your-ai-hackclub-key
AI_BASE_URL=https://ai.hackclub.com/proxy/v1
AI_MODEL=openai/gpt-4o-mini
# Optional fallback model, live web search/page fetch, code sandbox, and email
# AI_FALLBACK_API_KEY=
# AI_FALLBACK_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
# AI_FALLBACK_MODEL=gemini-2.5-flash
# Optional encryption for per-user model keys and MCP bearer tokens in Slack App Home
# Generate separately with: openssl rand -base64 32
# SLACK_USER_SECRETS_ENCRYPTION_KEY=
# EXA_API_KEY=
# E2B_API_KEY=
# Optional GitHub file edits; use a fine-grained token restricted to approved repos with Contents read/write permission
# GITHUB_TOKEN=
# GITHUB_ALLOWED_OWNERS=your-github-user-or-org
# GITHUB_ALLOWED_SLACK_USERS=U0123456789

# Slack Bot Integration & Auto-Invite
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_NEWS_CHANNEL=C0C8T8Q8R9P
SLACK_HACKI_CHANNEL=hacki

# Slack Features
ENABLE_SLACK_BOT=true
ENABLE_SLACK_SYNC=true
SLACK_SYNC_INTERVAL_MS=300000

# Hack Club Auth (auth.hackclub.com)
HACKCLUB_CLIENT_ID=e26af0e5bf638208efa68e2df56a0c10
HACKCLUB_CLIENT_SECRET=561892e90f34f125ca1d52c6dcd2e7b4a7886ae64e71cc63df1553f2566ef824
HACKCLUB_REDIRECT_URI=https://<your-username>.hackclub.app/auth/callback
PUBLIC_BASE_URL=https://<your-username>.hackclub.app
```
*(Press `Ctrl + O`, then `Enter` to save, and `Ctrl + X` to exit `nano`).*

---

### 5. Fetch Initial Data Cache

Run the data indexer once to download team members and YSWS catalog:

```bash
npm run sync
```

You should see:
- `Successfully indexed 145 team members`
- `Successfully indexed 234 YSWS programs`

---

### 6. Run with PM2 (Persistent Background Process)

Start Hacki in the background with PM2:

```bash
# Start Hacki
pm2 start ecosystem.config.cjs

# Check status
pm2 status

# View live logs
pm2 logs hacki

# Ensure PM2 starts on server reboot
pm2 save
```

---

### 7. Expose via Caddy on Nest

To route `https://<your-username>.hackclub.app` to your Hacki instance running on port 3000:

1. Check your Caddy directory:
```bash
mkdir -p ~/.caddy
```

2. Edit `~/.caddy/Caddyfile`:
```caddy
<your-username>.hackclub.app {
    reverse_proxy localhost:3000
}
```

3. Reload Caddy:
```bash
caddy reload
```

---

### 8. Slack Bot Permissions and App Home

To enable Hacki's interaction-triggered `#hacki` invites, thread tools, channel actions, and App Home:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click your app.
2. Under **OAuth & Permissions** &rarr; **Scopes** &rarr; **Bot Token Scopes**, make sure to add:
   - `app_mentions:read` (Allows explicit mentions)
   - `im:read` & `im:history` (Allows DMs and DM thread context)
   - `im:write` (Allows reminder delivery in DMs)
   - `channels:write.invites` (Allows bot to invite users to public channels)
   - `channels:read` & `channels:join` (Allows bot to find and join the channel)
   - `channels:manage` (Allows Hacki to leave a public channel after a bot invites it and create public channels after confirmation)
   - `users:read` (Allows Hacki to check whether the inviter is a bot)
   - `channels:history` (Allows Hacki to continue threads and search recent posts in public channels it has joined)
   - `groups:read` & `groups:history` (Allows Hacki to read private channel details and thread context where it is a member)
   - `groups:write` & `groups:write.invites` (Allows confirmed private channel creation and inviting the requesting user)
   - `files:write` (Allows Hacki to upload rendered Mermaid diagrams)
   - `reactions:write` (Allows Hacki to add requested reactions)
   - `canvases:write` (Allows Hacki to create or append to a channel canvas after confirmation)
   - `chat:write` (Allows bot to reply and deliver reminders)
3. Under **App Home**, enable the Home tab and allow users to message Hacki.
4. Under **Event Subscriptions** &rarr; **Subscribe to bot events**, add `app_mention`, `message.channels`, `message.im`, `member_joined_channel`, and `app_home_opened`.
5. Enable **Interactivity & Shortcuts** so the post, poll, channel, canvas, file upload, public site preview, email, and data erasure confirmation buttons work with Socket Mode.
6. Click **Reinstall to Workspace** at the top of the OAuth page so the updated permissions take effect.
7. Ensure the bot is added to your `#hacki` channel (`/invite @Hacki` in the channel).

Private-channel features require `groups:read` and `groups:history`; confirmed private channel creation also requires `groups:write` and `groups:write.invites`. Public channel creation uses `channels:manage`.

Channel canvases require Slack's Canvas feature to be available for the workspace. Slack allows only one canvas tab per channel on the free plan; Hacki appends confirmed new content to the channel's existing canvas when one is already present.

`EXA_API_KEY` enables live general web search and the `fetch: https://...` Slack command. `BROWSER_CDP_URL` optionally connects Playwright to a remotely hosted headful Chromium browser over CDP so Hacki can read JavaScript-rendered public pages. Without Exa or a browser endpoint, Hacki still answers with its configured Hack Club sources, but cannot fetch arbitrary public pages. `E2B_API_KEY` enables isolated code execution, shell commands, file operations, confirmed uploads (up to 10 MB), and confirmed temporary public static previews from persistent thread sandboxes. `files:write` is required for Slack uploads. E2B previews stay online only while their sandbox is running (currently up to one hour of inactivity); anyone with the preview URL can access its served directory. SMTP credentials enable one-time welcome emails for new accounts, confirmed email sending from Slack, and admin broadcasts to members who explicitly opted in. Admin broadcasts include an unsubscribe link. For Gmail, set `SMTP_URL=smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465` and `MAIL_FROM="Your Name <you@gmail.com>"` in the server `.env`; use a Google app password and keep it out of Git. These integrations are optional and configured on the server in `.env`.

Optional GitHub edits are limited to existing text files in public repositories. They require `GITHUB_TOKEN` as a fine-grained token limited to the intended repositories with Contents read/write permission, plus comma-separated `GITHUB_ALLOWED_OWNERS` and `GITHUB_ALLOWED_SLACK_USERS`. Both allowlists apply together. The requesting Slack user reviews the full replacement and commit message, then confirms before Hacki writes; a changed file invalidates the preview. Keep the GitHub token server-side and restrict its repository access. Public GitHub lookups work without this token.

Slack reply streaming uses `chat:write` with Socket Mode and starts each assistant answer as a thread reply. No additional Slack scopes are required. If a model endpoint rejects streaming, Hacki retries that step without streaming and posts the completed answer normally.

The browser service receives requested page URLs and returns rendered page text. Hacki creates a fresh browser context per request and blocks non-HTTPS and private-network requests. Browser rendering requires no Slack scopes.

To enable per-user model keys and remote MCP servers from App Home, set `SLACK_USER_SECRETS_ENCRYPTION_KEY` to a base64-encoded 32-byte secret (`openssl rand -base64 32`). Back it up and keep it unchanged: rotating or losing it makes saved provider keys and MCP bearer tokens undecryptable. `SLACK_MODEL_KEYS_ENCRYPTION_KEY` remains a legacy alias. Users choose among the supported model providers; their Slack model calls use only that provider and do not fall back to Hacki's shared AI key. Choose a model that supports OpenAI-compatible chat completions and tool calls. Other integrations such as Exa can still receive their relevant queries. MCP endpoints must be publicly reachable HTTPS Streamable HTTP servers and resolve to public IP addresses; OAuth and stdio servers are not supported. Tool calls send the user's prompt data and arguments to the configured MCP server. No extra Slack scopes are needed beyond the App Home and interactivity setup above.

Slack sends this event only for channels Hacki is already in. Hacki checks the event's inviter and leaves when that inviter is a bot/app. The bot join event itself is ignored.

---

### 9. Updating Hacki

Whenever you push changes from your computer to GitHub:

```bash
cd ~/hacki
git pull
npm install
pm2 restart hacki
```
