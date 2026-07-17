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

const logHistory = [];
const MAX_LOGS = 200;

app.use(basicAuth({
  users: { 'admin': 'admin' },
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

    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg border border-purple-500/30">
      <p class="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-3">📢 Broadcast Panel</p>
      <textarea id="broadcastText" rows="4" class="w-full bg-gray-900 text-white border border-gray-600 rounded-lg p-3 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none transition duration-200" placeholder="Tulis pesan broadcast di sini..."></textarea>
      <button onclick="kirimBroadcast()" class="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-2 px-4 rounded w-full mt-3 transition duration-300 shadow-lg">📤 Kirim Broadcast</button>
    </div>

    <div class="bg-gray-800 rounded-2xl p-5 shadow-lg border border-green-500/30">
      <p class="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-400 mb-3">⚙️ Manajemen Fitur</p>
      <div id="toggle-container"></div>
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

    function kirimBroadcast() {
      const pesan = document.getElementById('broadcastText').value;
      if (!pesan.trim()) return alert('Pesan tidak boleh kosong!');

      const konfirmasi = confirm('Yakin ingin mengirim pesan ini ke SEMUA pengguna?');
      if (konfirmasi) {
        socket.emit('send_broadcast', pesan);
        document.getElementById('broadcastText').value = '';
        alert('Memulai pengiriman! Silakan pantau progresnya di Live Log Terminal di bawah.');
      }
    }

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

    socket.on('init_toggles', (toggles) => {
      const container = document.getElementById('toggle-container');
      container.innerHTML = '';

      for (const [feature, isEnabled] of Object.entries(toggles)) {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center mb-3 bg-gray-800 p-3 rounded';

        const label = document.createElement('span');
        label.className = 'text-white font-semibold uppercase text-sm';
        label.innerText = feature.replace(/_/g, ' ');

        const btn = document.createElement('button');
        btn.className = `px-4 py-1 rounded font-bold transition duration-300 ${isEnabled ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`;
        btn.innerText = isEnabled ? 'ON' : 'OFF';

        btn.onclick = () => {
          socket.emit('update_toggle', { feature: feature, status: !isEnabled });
        };

        div.appendChild(label);
        div.appendChild(btn);
        container.appendChild(div);
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

let dashboardSock = null;
let dashboardToggles = null;

io.on('connection', (socket) => {
    console.log('[Dashboard] Klien baru terhubung ke Socket.io');

    logHistory.forEach(msg => {
      socket.emit('terminal_log', msg);
    });

    if (dashboardToggles) {
      socket.emit('init_toggles', dashboardToggles);
    }

    socket.on('update_toggle', (data) => {
      if (dashboardToggles && Object.prototype.hasOwnProperty.call(dashboardToggles, data.feature)) {
        dashboardToggles[data.feature] = data.status;
        console.log(`[⚙️ SYSTEM] Fitur '${data.feature}' diubah menjadi: ${data.status ? 'ON' : 'OFF'}`);
        io.emit('init_toggles', dashboardToggles);
      }
    });

  socket.on('send_broadcast', async (pesan) => {
      let users = [];
      if (typeof limiters.keys === 'function') {
          users = Array.from(limiters.keys());
      } else {
          users = Object.keys(limiters);
      }

      console.log(`[📢 BROADCAST] Memulai pengiriman ke ${users.length} pengguna...`);

      for (let jid of users) {
          jid = String(jid);
          console.log(`[🔍 DEBUG] Memproses ID asli: ${jid}`);

          if (!jid.includes('@')) {
              jid = jid + '@s.whatsapp.net';
          }

          if (jid.includes(':')) {
              const parts = jid.split('@');
              jid = parts[0].split(':')[0] + '@' + parts[1];
          }

          try {
              if (!dashboardSock) {
                  console.log(`[❌ GAGAL KRITIS] Objek 'sock' Baileys tidak ditemukan! Cek parameter di index.js.`);
                  break;
              }

              await dashboardSock.sendMessage(jid, { text: pesan });
              console.log(`[✅ TERKIRIM] Broadcast sukses ke: ${jid}`);

              await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (error) {
              console.log(`[❌ GAGAL] Broadcast ke ${jid} Error: ${error.message}`);
          }
      }
      console.log(`[🎉 BROADCAST SELESAI] Selesai memproses pesan!`);
  });
});

export function startDashboard(sock, featureToggles) {
  dashboardSock = sock;
  dashboardToggles = featureToggles;

  const originalLog = console.log.bind(console);
  console.log = (...args) => {
    originalLog(...args);
    const msg = args.join(' ');
    logHistory.push(msg);
    if (logHistory.length > MAX_LOGS) {
      logHistory.shift();
    }
    if (typeof io !== 'undefined') {
      io.emit('terminal_log', msg);
    }
  };

  const originalInfo = console.info.bind(console);
  console.info = (...args) => {
    originalInfo(...args);
    const msg = args.join(' ');
    logHistory.push(msg);
    if (logHistory.length > MAX_LOGS) {
      logHistory.shift();
    }
    if (typeof io !== 'undefined') {
      io.emit('terminal_log', msg);
    }
  };

  const originalWarn = console.warn.bind(console);
  console.warn = (...args) => {
    originalWarn(...args);
    const msg = args.join(' ');
    logHistory.push(msg);
    if (logHistory.length > MAX_LOGS) {
      logHistory.shift();
    }
    if (typeof io !== 'undefined') {
      io.emit('terminal_log', msg);
    }
  };

  const originalError = console.error.bind(console);
  console.error = (...args) => {
    originalError(...args);
    const msg = args.join(' ');
    logHistory.push(msg);
    if (logHistory.length > MAX_LOGS) {
      logHistory.shift();
    }
    if (typeof io !== 'undefined') {
      io.emit('terminal_log', msg);
    }
  };

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
