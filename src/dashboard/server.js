import http from 'http';
import express from 'express';
import basicAuth from 'express-basic-auth';
import { Server } from 'socket.io';
import logger from '../utils/logger.js';
import { limiters } from '../middlewares/rateLimiter.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
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
  <script src="/socket.io/socket.io.js"></script>
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
        <p class="text-xl font-semibold mt-1" id="total-users">${totalUsers}</p>
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
        <tbody id="user-table-body">${tableRows}</tbody>
      </table>
    </div>

    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg border border-gray-700">
      <p class="text-sm text-gray-400 uppercase tracking-wide mb-3">Live Terminal</p>
      <div id="terminal-box" class="bg-black text-green-400 font-mono text-sm p-4 h-64 overflow-y-auto rounded-lg shadow-lg"></div>
    </div>
  </div>

  <script>
    const socket = io();
    const terminal = document.getElementById('terminal-box');

    socket.on('terminal_log', (msg) => {
      const div = document.createElement('div');
      div.textContent = msg;
      terminal.appendChild(div);
      terminal.scrollTop = terminal.scrollHeight;
    });

    socket.on('update_stats', (data) => {
      document.getElementById('total-users').innerText = data.total;
      const tbody = document.getElementById('user-table-body');
      if (data.total === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-gray-500">Belum ada data pengguna</td></tr>';
      } else {
        tbody.innerHTML = data.users.map(u =>
          '<tr class="border-b border-gray-700 hover:bg-gray-700">' +
            '<td class="px-4 py-3">' + u.no + '</td>' +
            '<td class="px-4 py-3 font-mono text-sm">' + u.id + '</td>' +
            '<td class="px-4 py-3">' + u.used + ' / ' + u.limit + '</td>' +
          '</tr>'
        ).join('');
      }
    });
  </script>
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
  const _log = console.log;
  const _info = console.info;
  const _warn = console.warn;
  const _error = console.error;

  function emitLog(level, args) {
    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const msg = Array.from(args).map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    io.emit('terminal_log', `[${now}] [${level}] ${msg}`);
  }

  console.log = function (...args) { _log.apply(console, args); emitLog('LOG', args); };
  console.info = function (...args) { _info.apply(console, args); emitLog('INFO', args); };
  console.warn = function (...args) { _warn.apply(console, args); emitLog('WARN', args); };
  console.error = function (...args) { _error.apply(console, args); emitLog('ERROR', args); };

  const levels = ['info', 'warn', 'error', 'fatal'];
  for (const level of levels) {
    const original = logger[level];
    if (original) {
      logger[level] = function (...args) {
        const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const msg = Array.from(args).filter(a => typeof a === 'string').join(' ');
        io.emit('terminal_log', `[${now}] [${level.toUpperCase()}] ${msg}`);
        original.apply(this, args);
      };
    }
  }

  setInterval(() => {
    const users = [];
    let i = 1;
    for (const [jid, limiter] of limiters) {
      const remaining = limiter._reservoir ?? MAX_REQUESTS;
      const used = MAX_REQUESTS - remaining;
      users.push({ no: i++, id: jid, used, limit: MAX_REQUESTS });
    }
    io.emit('update_stats', { total: limiters.size, users });
  }, 3000);

  server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Dashboard server started');
  });
}
