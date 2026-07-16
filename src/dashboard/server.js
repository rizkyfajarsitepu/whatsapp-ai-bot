import express from 'express';
import basicAuth from 'express-basic-auth';
import logger from '../utils/logger.js';
import { limiters } from '../middlewares/rateLimiter.js';

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;
const MAX_REQUESTS = 10;

app.use(basicAuth({
  users: { 'admin': 'rahasia123' },
  challenge: true,
}));

app.get('/', (req, res) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const uptimeStr = `${hours}h ${minutes}m`;
  const totalUsers = limiters.size;

  let tableRows = '';
  if (totalUsers === 0) {
    tableRows = `<tr><td colspan="3" class="px-4 py-6 text-center text-gray-500">Belum ada data pengguna</td></tr>`;
  } else {
    let i = 1;
    for (const [jid, limiter] of limiters) {
      const remaining = limiter._reservoir ?? MAX_REQUESTS;
      const used = MAX_REQUESTS - remaining;
      tableRows += `<tr class="border-b border-gray-700 hover:bg-gray-700">
        <td class="px-4 py-3">${i}</td>
        <td class="px-4 py-3 font-mono text-sm">${jid}</td>
        <td class="px-4 py-3">${used} / ${MAX_REQUESTS}</td>
      </tr>`;
      i++;
    }
  }

  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Control Panel Bot</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-white min-h-screen p-4">
  <div class="w-full max-w-4xl mx-auto space-y-6">
    <h1 class="text-2xl font-bold text-center text-purple-400">Control Panel Bot - RyzarsAI</h1>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <p class="text-xl font-semibold mt-1">${totalUsers}</p>
      </div>
    </div>

    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg border border-gray-700 overflow-x-auto">
      <p class="text-sm text-gray-400 uppercase tracking-wide mb-3">Daftar Pengguna</p>
      <table class="w-full text-left">
        <thead>
          <tr class="border-b border-gray-600 text-gray-400 text-sm uppercase">
            <th class="px-4 py-2">#</th>
            <th class="px-4 py-2">ID Pengguna</th>
            <th class="px-4 py-2">Pemakaian</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
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
