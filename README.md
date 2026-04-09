# 🔍 KITCBE Uptime Monitor

A lightweight, zero-cost uptime monitoring service built on **Cloudflare Workers** + **Cloudflare KV**.

## Features

- ⏰ **Automatic checks every 5 minutes** via Cloudflare Cron Triggers
- 🌐 **Monitors** `kitcbe.com` and `portal.kitcbe.com`
- 📊 **Stores** response time, HTTP status code, and errors in Cloudflare KV (last 100 checks per site)
- 🖥️ **Beautiful dark dashboard** at your Worker URL
- 📡 **JSON API** at `/api/status`
- 🆓 **100% free** within Cloudflare's free tier (100k requests/day)

---

## 🚀 Deployment (Step-by-Step)

### 1. Install dependencies

```bash
npm install
```

### 2. Log in to Cloudflare

```bash
npx wrangler login
```

### 3. Create the KV Namespace

```bash
# Production namespace
npm run kv:create

# Preview namespace (for local dev)
npm run kv:create:preview
```

> **Important:** After running each command, Wrangler will print the namespace ID.  
> Copy those IDs into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "UPTIME_KV"
id = "PASTE_PRODUCTION_ID_HERE"
preview_id = "PASTE_PREVIEW_ID_HERE"
```

### 4. Deploy

```bash
npm run deploy
```

Your Worker will be live at:  
`https://uptime-monitor.<your-subdomain>.workers.dev`

---

## 🧪 Local Development

```bash
npm run dev
```

Then visit `http://localhost:8787`.

To manually trigger a check (simulates the cron):

```bash
curl -X POST http://localhost:8787/api/check
```

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | HTML status dashboard |
| `/api/status` | GET | JSON data for all sites |
| `/api/check` | POST | Manually trigger a check (for testing) |

### Example `/api/status` response

```json
{
  "ok": true,
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "sites": [
    {
      "name": "KITCBE Main Site",
      "url": "https://kitcbe.com",
      "currentStatus": "up",
      "lastChecked": "2024-01-01T00:00:00.000Z",
      "uptimePct": "100.0",
      "avgResponse": 342,
      "history": [...]
    }
  ]
}
```

---

## 📁 Project Structure

```
uptime-monitor/
├── src/
│   └── index.js        # Worker code (checks + dashboard + API)
├── wrangler.toml       # Cloudflare Worker configuration
├── package.json
└── README.md
```

---

## ⚙️ Configuration

Edit `src/index.js` to change:

- **`SITES`** — add/remove URLs to monitor
- **`MAX_HISTORY`** — number of check records to retain per site (default: 100)
- **Timeout** — per-site request timeout in milliseconds (default: 10000ms)

---

## 📜 License

MIT
