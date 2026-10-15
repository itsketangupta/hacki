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

```bash
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

### 8. Slack Bot Permissions for Auto-Invite to #hacki

To enable Hacki to automatically invite members to the `#hacki` channel when they log in:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click your app.
2. Under **OAuth & Permissions** &rarr; **Scopes** &rarr; **Bot Token Scopes**, make sure to add:
   - `channels:write.invites` (Allows bot to invite users to public channels)
   - `channels:read` & `channels:join` (Allows bot to find and join the channel)
   - `chat:write` (Allows bot to post a welcome message)
3. Click **Reinstall to Workspace** at the top of the OAuth page so the updated permissions take effect.
4. Ensure the bot is added to your `#hacki` channel (`/invite @Hacki` in the channel).

---

### 9. Updating Hacki

Whenever you push changes from your computer to GitHub:

```bash
cd ~/hacki
git pull
npm install
pm2 restart hacki
```
