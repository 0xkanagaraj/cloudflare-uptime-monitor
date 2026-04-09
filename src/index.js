const SITES = [
  {
    name: "KITCBE Main Site",
    url: "https://kitcbe.com",
    timeout: 10000,
  },
  {
    name: "KITCBE Portal",
    url: "https://portal.kitcbe.com",
    timeout: 10000,
  },
];

const MAX_HISTORY = 100;

async function checkSite(site) {
  const startTime = Date.now();
  let status = "down";
  let statusCode = null;
  let responseTime = null;
  let error = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), site.timeout);

    const response = await fetch(site.url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "UptimeMonitor/1.0 (Cloudflare Worker)",
      },
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    responseTime = Date.now() - startTime;
    statusCode = response.status;

    status = response.ok || (statusCode >= 300 && statusCode < 400) ? "up" : "down";
  } catch (err) {
    responseTime = Date.now() - startTime;
    error = err.name === "AbortError" ? "Timeout" : err.message;
    status = "down";
  }

  return {
    timestamp: new Date().toISOString(),
    status,
    statusCode,
    responseTime,
    error,
  };
}

async function runChecks(env) {
  const results = [];

  for (const site of SITES) {
    const result = await checkSite(site);
    const kvKey = `history:${site.url}`;

    let history = [];
    try {
      const stored = await env.UPTIME_KV.get(kvKey, { type: "json" });
      if (Array.isArray(stored)) history = stored;
    } catch (_) {
      history = [];
    }

    history.unshift(result);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);

    await env.UPTIME_KV.put(kvKey, JSON.stringify(history));

    results.push({ site, result, history });
    console.log(`[${result.status.toUpperCase()}] ${site.url} — ${result.responseTime}ms (HTTP ${result.statusCode ?? "N/A"})`);
  }

  return results;
}

async function loadAllHistory(env) {
  const data = [];

  for (const site of SITES) {
    const kvKey = `history:${site.url}`;
    let history = [];
    try {
      const stored = await env.UPTIME_KV.get(kvKey, { type: "json" });
      if (Array.isArray(stored)) history = stored;
    } catch (_) {
      history = [];
    }

    const latest = history[0] ?? null;
    const upCount = history.filter((h) => h.status === "up").length;
    const uptimePct = history.length > 0 ? ((upCount / history.length) * 100).toFixed(1) : null;
    const avgResponse =
      history.length > 0
        ? Math.round(history.filter((h) => h.responseTime != null).reduce((s, h) => s + h.responseTime, 0) / history.filter((h) => h.responseTime != null).length)
        : null;

    data.push({
      name: site.name,
      url: site.url,
      currentStatus: latest?.status ?? "unknown",
      lastChecked: latest?.timestamp ?? null,
      uptimePct,
      avgResponse,
      history: history.slice(0, MAX_HISTORY),
    });
  }

  return data;
}

function buildDashboard(sites) {
  const now = new Date().toISOString();

  const siteCards = sites
    .map((site) => {
      const statusClass = site.currentStatus === "up" ? "up" : site.currentStatus === "unknown" ? "unknown" : "down";
      const statusLabel = site.currentStatus === "up" ? "Operational" : site.currentStatus === "unknown" ? "No Data" : "Down";
      const statusEmoji = site.currentStatus === "up" ? "✅" : site.currentStatus === "unknown" ? "❓" : "🔴";

      const sparkBars = site.history
        .slice(0, 30)
        .reverse()
        .map((h) => {
          const cls = h.status === "up" ? "bar-up" : "bar-down";
          const tip = `${h.timestamp.replace("T", " ").slice(0, 16)} — ${h.status.toUpperCase()} (${h.responseTime ?? "N/A"}ms)`;
          return `<div class="bar ${cls}" title="${tip}"></div>`;
        })
        .join("");

      const lastCheckedFormatted = site.lastChecked
        ? new Date(site.lastChecked).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        : "Never";

      return `
      <div class="card ${statusClass}-card">
        <div class="card-header">
          <div>
            <h2 class="site-name">${site.name}</h2>
            <a class="site-url" href="${site.url}" target="_blank" rel="noopener">${site.url}</a>
          </div>
          <div class="status-badge ${statusClass}">
            <span>${statusEmoji}</span>
            <span>${statusLabel}</span>
          </div>
        </div>

        <div class="metrics">
          <div class="metric">
            <span class="metric-value">${site.uptimePct !== null ? site.uptimePct + "%" : "—"}</span>
            <span class="metric-label">Uptime (last ${site.history.length} checks)</span>
          </div>
          <div class="metric">
            <span class="metric-value">${site.avgResponse !== null ? site.avgResponse + "ms" : "—"}</span>
            <span class="metric-label">Avg Response Time</span>
          </div>
          <div class="metric">
            <span class="metric-value">${site.history.length}</span>
            <span class="metric-label">Total Checks</span>
          </div>
        </div>

        <div class="sparkline-section">
          <p class="sparkline-label">Last 30 checks (oldest → newest)</p>
          <div class="sparkline">${sparkBars || '<span class="no-data">No data yet — first check pending</span>'}</div>
        </div>

        <div class="last-checked">Last checked: ${lastCheckedFormatted} IST</div>

        <div class="recent-table-wrapper">
          <table class="recent-table">
            <thead>
              <tr>
                <th>Timestamp (IST)</th>
                <th>Status</th>
                <th>HTTP Code</th>
                <th>Response Time</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              ${site.history
                .slice(0, 10)
                .map((h) => {
                  const ts = new Date(h.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
                  const rowCls = h.status === "up" ? "row-up" : "row-down";
                  return `<tr class="${rowCls}">
                    <td>${ts}</td>
                    <td><span class="pill ${h.status}">${h.status.toUpperCase()}</span></td>
                    <td>${h.statusCode ?? "—"}</td>
                    <td>${h.responseTime != null ? h.responseTime + "ms" : "—"}</td>
                    <td>${h.error ?? "—"}</td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    })
    .join("\n");

  const allUp = sites.every((s) => s.currentStatus === "up");
  const anyDown = sites.some((s) => s.currentStatus === "down");
  const overallClass = allUp ? "all-up" : anyDown ? "any-down" : "unknown";
  const overallText = allUp ? "✅ All Systems Operational" : anyDown ? "🔴 Outage Detected" : "❓ Awaiting First Check";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Uptime Monitor — KITCBE</title>
  <meta name="description" content="Real-time uptime monitoring for KITCBE web properties. Powered by Cloudflare Workers." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0a0e1a;
      --surface: #111827;
      --surface2: #1a2235;
      --border: #1e2d45;
      --text: #e2e8f0;
      --text-muted: #64748b;
      --text-dim: #94a3b8;
      --green: #10b981;
      --green-bg: rgba(16,185,129,0.08);
      --green-border: rgba(16,185,129,0.25);
      --red: #ef4444;
      --red-bg: rgba(239,68,68,0.08);
      --red-border: rgba(239,68,68,0.25);
      --yellow: #f59e0b;
      --blue: #3b82f6;
      --blue-glow: rgba(59,130,246,0.15);
      --accent: #6366f1;
      --accent-glow: rgba(99,102,241,0.2);
      --radius: 16px;
      --radius-sm: 8px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      padding: 0 0 64px;
    }

    .header {
      background: linear-gradient(135deg, #0d1426 0%, #111827 50%, #0f172a 100%);
      border-bottom: 1px solid var(--border);
      padding: 40px 24px 32px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .header::before {
      content: '';
      position: absolute;
      top: -60px; left: 50%; transform: translateX(-50%);
      width: 600px; height: 300px;
      background: radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .header-logo {
      font-size: 13px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 600;
      margin-bottom: 12px;
    }
    .header h1 {
      font-size: clamp(28px, 5vw, 48px);
      font-weight: 800;
      background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 12px;
    }
    .header-sub {
      color: var(--text-muted);
      font-size: 14px;
    }

    .overall-banner {
      max-width: 900px;
      margin: 32px auto 0;
      padding: 16px 24px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      text-align: center;
      transition: all 0.3s;
    }
    .overall-banner.all-up {
      background: var(--green-bg);
      border: 1px solid var(--green-border);
      color: var(--green);
    }
    .overall-banner.any-down {
      background: var(--red-bg);
      border: 1px solid var(--red-border);
      color: var(--red);
    }
    .overall-banner.unknown {
      background: rgba(100,116,139,0.1);
      border: 1px solid rgba(100,116,139,0.2);
      color: var(--text-muted);
    }

    .container {
      max-width: 900px;
      margin: 40px auto;
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 28px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .card:hover { transform: translateY(-2px); box-shadow: 0 8px 40px rgba(0,0,0,0.3); }
    .up-card { border-left: 3px solid var(--green); }
    .down-card { border-left: 3px solid var(--red); }
    .unknown-card { border-left: 3px solid var(--text-muted); }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .site-name {
      font-size: 20px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }
    .site-url {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--blue);
      text-decoration: none;
    }
    .site-url:hover { text-decoration: underline; }

    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }
    .status-badge.up { background: var(--green-bg); border: 1px solid var(--green-border); color: var(--green); }
    .status-badge.down { background: var(--red-bg); border: 1px solid var(--red-border); color: var(--red); }
    .status-badge.unknown { background: rgba(100,116,139,0.1); border: 1px solid rgba(100,116,139,0.2); color: var(--text-muted); }

    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric {
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 16px;
      text-align: center;
    }
    .metric-value {
      display: block;
      font-size: 22px;
      font-weight: 700;
      color: var(--text);
      font-family: 'JetBrains Mono', monospace;
      margin-bottom: 4px;
    }
    .metric-label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .sparkline-section { margin-bottom: 20px; }
    .sparkline-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .sparkline {
      display: flex;
      gap: 3px;
      align-items: flex-end;
      height: 32px;
    }
    .bar {
      flex: 1;
      border-radius: 2px;
      height: 100%;
      cursor: default;
      transition: opacity 0.15s;
    }
    .bar:hover { opacity: 0.7; }
    .bar-up { background: var(--green); }
    .bar-down { background: var(--red); }
    .no-data { font-size: 13px; color: var(--text-muted); }

    .last-checked {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 20px;
    }

    .recent-table-wrapper {
      overflow-x: auto;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
    }
    .recent-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .recent-table th {
      padding: 10px 14px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      background: var(--surface2);
      border-bottom: 1px solid var(--border);
    }
    .recent-table td {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(30,45,69,0.5);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-dim);
    }
    .recent-table tr:last-child td { border-bottom: none; }
    .row-up td { background: rgba(16,185,129,0.02); }
    .row-down td { background: rgba(239,68,68,0.03); }

    .pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .pill.up { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
    .pill.down { background: var(--red-bg); color: var(--red); border: 1px solid var(--red-border); }
    .pill.unknown { background: rgba(100,116,139,0.1); color: var(--text-muted); }

    .footer {
      text-align: center;
      padding: 32px 24px 0;
      color: var(--text-muted);
      font-size: 12px;
    }
    .footer a { color: var(--accent); text-decoration: none; }
    .footer a:hover { text-decoration: underline; }

    .api-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      padding: 8px 20px;
      border-radius: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 13px;
      text-decoration: none;
      transition: border-color 0.2s, color 0.2s;
    }
    .api-link:hover { border-color: var(--accent); color: var(--text); }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.8); }
    }
    .live-dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--green);
      animation: pulse-dot 2s infinite;
      margin-right: 6px;
    }

    @media (max-width: 600px) {
      .metrics { grid-template-columns: 1fr 1fr; }
      .card { padding: 20px 16px; }
      .card-header { flex-direction: column; }
    }
  </style>
</head>
<body>

<header class="header">
  <p class="header-logo">🔍 KITCBE · Uptime Monitor</p>
  <h1>Website Status Dashboard</h1>
  <p class="header-sub">Checks run every 5 minutes via Cloudflare Workers · Powered by Cron Triggers + KV</p>

  <div class="overall-banner ${overallClass}" style="max-width:860px;margin:24px auto 0;">
    <span class="live-dot"></span>${overallText}
  </div>
</header>

<main class="container" id="main">
  ${siteCards}
</main>

<footer class="footer">
  <p>Generated at ${new Date(now).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST &nbsp;·&nbsp; Checks stored up to ${MAX_HISTORY} records per site</p>
  <br/>
  <a class="api-link" href="/api/status">📡 View raw JSON API →</a>
</footer>

</body>
</html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/status") {
      try {
        const data = await loadAllHistory(env);
        return new Response(JSON.stringify({ ok: true, generatedAt: new Date().toISOString(), sites: data }, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
          },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname === "/api/check" && request.method === "POST") {
      try {
        await runChecks(env);
        const data = await loadAllHistory(env);
        return new Response(JSON.stringify({ ok: true, message: "Checks completed", sites: data }, null, 2), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    try {
      const sites = await loadAllHistory(env);
      const html = buildDashboard(sites);
      return new Response(html, {
        headers: {
          "Content-Type": "text/html;charset=UTF-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      return new Response(`<h1>Error loading dashboard</h1><pre>${err.message}</pre>`, {
        status: 500,
        headers: { "Content-Type": "text/html" },
      });
    }
  },

  async scheduled(event, env, ctx) {
    console.log(`[Cron] Triggered at ${new Date().toISOString()}`);
    await runChecks(env);
    console.log(`[Cron] All checks complete.`);
  },
};
