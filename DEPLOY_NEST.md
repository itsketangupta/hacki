# Deploying Hacki to Hack Club Nest (hackclub.app)

**Hack Club Nest** (`nest.hackclub.app`) is the community Linux server where Hack Club members can host bots, websites, and APIs.

Follow these steps to deploy Hacki on Nest:

---

### 1. Connect to your Nest account via SSH

Open your terminal and SSH into Nest using your Hack Club username:

```bash
ssh <your-username>@nest.hackclub.app
```

*(If you don't have a Nest account yet, join `#nest` on the Hack Club Slack and run `/nest signup` or ask in the channel).*

---

### 2. Clone or copy Hacki onto Nest

You can push your `hacki` folder to GitHub and clone it:

```bash
git clone https://github.com/<your-username>/hacki.git
cd hacki
```

Or copy files directly using `scp` or `rsync` from your computer:

```bash
scp -r ./hacki <your-username>@nest.hackclub.app:~/hacki
```

---

### 3. Install Node.js Dependencies

Ensure Node.js 20+ is active, then install dependencies:

```bash
npm install
```

---

### 4. Configure Environment Variables (`.env`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
nano .env
```

Ensure your `.env` contains:
```env
PORT=3000
AI_API_KEY=sk-hc-v1-...
AI_BASE_URL=https://ai.hackclub.com/proxy/v1
AI_MODEL=openai/gpt-4o-mini
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_NEWS_CHANNEL=C0C8T8Q8R9P
ENABLE_SLACK_BOT=true
ENABLE_SLACK_SYNC=true
```

---

### 5. Fetch Initial Data Cache

Run the synchronization script to index all team members, YSWS programs, and announcements:

```bash
npm run sync
```

You should see:
- `Successfully indexed 145 team members`
- `Successfully indexed 234 YSWS programs`

---

### 6. Run with PM2 (Persistent Background Process)

Nest has PM2 installed so your app runs continuously even when you close SSH:

```bash
# Start Hacki
pm2 start ecosystem.config.cjs

# Check status
pm2 status

# View live logs
pm2 logs hacki

# Save process list so it restarts on server reboot
pm2 save
```

---

### 7. Expose your port on Hack Club Nest

On Nest, you can expose your web app using Caddy or the Nest port forwarder:

1. Check your assigned port or choose an available port (e.g. `3000` or assigned user port).
2. If using Caddy, edit `~/.caddy/Caddyfile` or your user configuration:
```caddy
yourusername.hackclub.app {
    reverse_proxy localhost:3000
}
```
3. Reload Caddy:
```bash
caddy reload
```

Now open `https://yourusername.hackclub.app` in your browser!

---

### Updating Hacki

Whenever you make updates to Hacki:

```bash
cd ~/hacki
git pull
npm install
pm2 restart hacki
```
