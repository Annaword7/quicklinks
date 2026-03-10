/**
 * Telegram notification proxy — deploy to Railway
 *
 * Railway setup:
 *   1. Push this project to a GitHub/GitLab repo
 *   2. New project → Deploy from GitHub repo
 *   3. Variables tab → add:
 *        TELEGRAM_BOT_TOKEN  = your bot token
 *        TELEGRAM_CHAT_ID    = your chat ID
 *        ALLOWED_ORIGINS     = comma-separated chrome-extension:// IDs
 *                              e.g. chrome-extension://abc123,chrome-extension://def456
 *   4. Copy the Railway public URL → paste into popup.js as PROXY_URL
 */

import http from 'http';

const PORT               = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const ALLOWED_ORIGINS    = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET') {
    res.writeHead(200);
    res.end('OK');
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }

  // Validate Origin header against allowed extension IDs
  const origin = req.headers['origin'] || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Read body
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', async () => {
    try {
      const body = JSON.parse(raw);

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text: body.text,
            parse_mode: 'HTML'
          })
        }
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

    } catch (e) {
      res.writeHead(400);
      res.end('Bad request');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
