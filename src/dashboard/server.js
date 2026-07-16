import express from 'express';
import basicAuth from 'express-basic-auth';
import logger from '../utils/logger.js';

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

app.use(basicAuth({
  users: { 'admin': 'rahasia123' },
  challenge: true,
}));

app.get('/', (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const uptimeStr = `${hours}h ${minutes}m`;

  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Control Panel Bot</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen flex items-center justify-center p-4">
  <div class="w-full max-w-md space-y-6">
    <h1 class="text-2xl font-bold text-center text-purple-400">Control Panel Bot - RyzarsAI</h1>

    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg border border-gray-700">
      <p class="text-sm text-gray-400 uppercase tracking-wide">Status</p>
      <p class="text-xl font-semibold mt-1 flex items-center gap-2">
        <span class="w-3 h-3 bg-green-400 rounded-full inline-block"></span>
        Online
      </p>
    </div>

    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg border border-gray-700">
      <p class="text-sm text-gray-400 uppercase tracking-wide">Uptime</p>
      <p class="text-xl font-semibold mt-1">${uptimeStr}</p>
    </div>

    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg border border-gray-700">
      <p class="text-sm text-gray-400 uppercase tracking-wide">Total Pengguna</p>
      <p class="text-xl font-semibold mt-1">-</p>
    </div>
  </div>
</body>
</html>`);
});

app.get('/api/stats', (req, res) => {
  res.json({
    status: 'online',
    uptime: process.uptime(),
    uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
  });
});

export function startDashboard() {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Dashboard server started');
  });
}
