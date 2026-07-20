import http from 'http';
import express from 'express';
import session from 'express-session';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import { limiters } from '../middlewares/rateLimiter.js';
import { getGroupsDB, toggleGroupVerification } from '../core/groupManager.js';
import { getRpgDB, suntikXP } from '../features/rpg.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.DASHBOARD_PORT || 3000;
const MAX_REQUESTS = 10;

const logHistory = [];
const MAX_LOGS = 200;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(session({
  secret: process.env.SESSION_SECRET || 'ryzars-super-secret-key-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

app.use(express.static(path.join(__dirname, 'public')));

const requireLogin = (req, res, next) => {
  if (req.session && req.session.isLoggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
};

app.get('/login', (req, res) => {
  if (req.session && req.session.isLoggedIn) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.post('/api/login', express.json(), (req, res) => {
  const { username, password } = req.body;

  if (username === 'superadmin' && password === 'rahasia123') {
    req.session.isLoggedIn = true;
    req.session.role = 'superadmin';
    req.session.userId = 'superadmin';
    return res.json({ success: true, message: 'Login Super Admin!', redirect: '/dashboard' });
  }

  let usersDB = loadUsers();
  if (usersDB[username] && usersDB[username].password === password) {
    req.session.isLoggedIn = true;
    req.session.role = usersDB[username].role;
    req.session.userId = username;
    req.session.groupId = usersDB[username].groupId;
    return res.json({ success: true, message: 'Login berhasil!', redirect: '/dashboard' });
  }

  return res.status(401).json({ success: false, message: 'ID atau Password salah!' });
});

app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/api/me', requireLogin, (req, res) => {
    res.json({
        username: req.session.userId,
        role: req.session.role,
        groupId: req.session.groupId || null
    });
});

const vouchersFile = path.join(__dirname, 'vouchers.json');

const loadVouchers = () => fs.existsSync(vouchersFile) ? JSON.parse(fs.readFileSync(vouchersFile)) : {};
const saveVouchers = (data) => fs.writeFileSync(vouchersFile, JSON.stringify(data, null, 2));

const usersFile = path.join(__dirname, 'users.json');
const loadUsers = () => fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile)) : {};
const saveUsers = (data) => fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));

const premiumGroupsFile = path.join(__dirname, 'premium_groups.json');
const loadPremium = () => fs.existsSync(premiumGroupsFile) ? JSON.parse(fs.readFileSync(premiumGroupsFile)) : {};
const savePremium = (data) => fs.writeFileSync(premiumGroupsFile, JSON.stringify(data, null, 2));

app.post('/api/buatvoucher', express.json(), requireLogin, (req, res) => {
    if (req.session.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Akses Ditolak! Hanya Super Admin.' });
    }

    const { durasi, jumlah } = req.body;
    const days = parseInt(durasi) || 30;
    const amount = parseInt(jumlah) || 1;

    let db = loadVouchers();
    let generatedCodes = [];

    for (let i = 0; i < amount; i++) {
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        const code = `RYZ-${days}D-${randomStr}`;

        db[code] = {
            duration: days,
            status: 'available',
            createdAt: Date.now(),
            usedBy: null
        };
        generatedCodes.push(code);
    }

    saveVouchers(db);
    res.json({ success: true, message: 'Voucher berhasil dibuat!', codes: generatedCodes });
});

app.post('/api/buat-akun', express.json(), requireLogin, (req, res) => {
    if (req.session.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Hanya Super Admin!' });
    }

    const { userId, groupId, password } = req.body;
    if (!userId || !groupId || !password) {
        return res.status(400).json({ success: false, message: 'Semua kolom wajib diisi!' });
    }

    let usersDB = loadUsers();
    usersDB[userId] = {
        password: password,
        role: 'admin_grup',
        groupId: groupId,
        createdAt: Date.now()
    };
    saveUsers(usersDB);
    res.json({ success: true, message: `Akun untuk ${userId} berhasil dibuat!` });
});

app.post('/api/redeem', express.json(), requireLogin, (req, res) => {
    if (req.session.role !== 'admin_grup') {
        return res.status(403).json({ success: false, message: 'Hanya Admin Grup yang bisa redeem!' });
    }

    const { kode } = req.body;
    const groupId = req.session.groupId;

    let db = loadVouchers();
    if (!db[kode] || db[kode].status !== 'available') {
        return res.status(400).json({ success: false, message: 'Voucher tidak valid atau sudah dipakai!' });
    }

    let premiumDB = loadPremium();
    const durationMs = db[kode].duration * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const currentExpired = premiumDB[groupId] ? premiumDB[groupId].expiredAt : now;
    const newExpired = (currentExpired > now ? currentExpired : now) + durationMs;

    premiumDB[groupId] = { expiredAt: newExpired };
    db[kode].status = 'used';
    db[kode].usedBy = groupId;
    db[kode].usedAt = now;

    savePremium(premiumDB);
    saveVouchers(db);

    res.json({ success: true, message: 'Berhasil! Bot aktif di grup Anda sampai: ' + new Date(newExpired).toLocaleDateString('id-ID') });
});

app.get('/api/status-grup', requireLogin, (req, res) => {
    if (req.session.role !== 'admin_grup') {
        return res.status(403).json({ success: false, message: 'Akses ditolak' });
    }

    const groupId = req.session.groupId;
    let premiumDB = loadPremium();
    const now = Date.now();

    let isActive = false;
    let expiredDate = '-';

    if (premiumDB[groupId] && premiumDB[groupId].expiredAt > now) {
        isActive = true;
        expiredDate = new Date(premiumDB[groupId].expiredAt).toLocaleDateString('id-ID', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    res.json({ success: true, isActive, expiredDate });
});

app.get('/api/cek-password', requireLogin, (req, res) => {
    if (req.session.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Akses Ditolak!' });
    }

    const userId = req.query.id;
    let usersDB = loadUsers();

    if (usersDB[userId]) {
        res.json({ success: true, password: usersDB[userId].password });
    } else {
        res.json({ success: false, message: 'ID Klien tidak ditemukan!' });
    }
});

app.post('/api/kill-grup', express.json(), requireLogin, (req, res) => {
    if (req.session.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Akses Ditolak!' });
    }

    const { groupId } = req.body;
    let premiumDB = loadPremium();

    if (premiumDB[groupId]) {
        premiumDB[groupId].expiredAt = 0;
        savePremium(premiumDB);
        res.json({ success: true, message: `Lisensi untuk grup ${groupId} berhasil dicabut (KILL)! Bot otomatis OFF.` });
    } else {
        res.status(400).json({ success: false, message: 'Grup tersebut tidak ditemukan atau belum berlangganan.' });
    }
});

app.get('/dashboard', requireLogin, (req, res) => {
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

  let dashboardHtml = fs.readFileSync(path.join(__dirname, 'public', 'dashboard.html'), 'utf-8');
  dashboardHtml = dashboardHtml
    .replace('{{TABLE_ROWS}}', tableRows)
    .replace('{{UPTIME_STR}}', uptimeStr)
    .replace('{{TOTAL_USERS}}', totalUsers);
  res.send(dashboardHtml);
});

app.get('/api/stats', (req, res) => {
  res.json({
    status: 'online',
    uptime: process.uptime(),
    uptimeFormatted: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
  });
});

app.get('/api/groups', (req, res) => {
  res.json(getGroupsDB());
});

app.post('/api/groups/toggle', express.json(), (req, res) => {
  const { groupId } = req.body;
  const newStatus = toggleGroupVerification(groupId);
  res.json({ success: true, verified: newStatus });
});

app.get('/api/rpg/users', (req, res) => {
  res.json(getRpgDB());
});

app.post('/api/rpg/suntik', express.json(), requireLogin, async (req, res) => {
  if (req.session.role !== 'superadmin' && req.session.role !== 'admin_grup') {
    return res.status(403).json({ error: 'Akses Ditolak!' });
  }

  let { jid, xp } = req.body;
  if (!jid || xp === undefined || isNaN(parseInt(xp))) {
    return res.status(400).json({ error: 'JID dan Jumlah XP wajib diisi (bisa angka negatif)' });
  }

  try {
    const rawJid = jid.trim();
    const cleanJid = rawJid.endsWith('@lid')
      ? rawJid
      : rawJid.split('@')[0].replace(/[^0-9]/g, '').replace(/^0/, '62') + '@s.whatsapp.net';

    const oldLevel = getRpgDB()[cleanJid] ? getRpgDB()[cleanJid].level : 0;
    const updatedUser = suntikXP(cleanJid, xp);

    if (dashboardSock && updatedUser.level !== oldLevel) {
      try {
        const groups = await dashboardSock.groupFetchAllParticipating().catch(() => ({}));
        for (const groupId in groups) {
          const group = groups[groupId];
          const isMember = group.participants.some(p => {
            const pid = typeof p === 'object' && p !== null ? p.id : p;
            return String(pid) === updatedUser.jid;
          });

          if (isMember) {
            const isPromotion = updatedUser.level > oldLevel;
            const alertMsg = isPromotion
              ? `🎉 *PROMOSI JABATAN* 🎉\n\nSelamat kepada @${updatedUser.jid.split('@')[0]}!\nJabatan anda kini naik menjadi: *${updatedUser.pangkat}* (Level ${updatedUser.level}).\n\n_Tetap mengabdi untuk rakyat ya!_`
              : `⚠️ *SANKSI DISIPLIN* ⚠️\n\nPerhatian! @${updatedUser.jid.split('@')[0]} telah dijatuhi sanksi.\nJabatan anda kini turun menjadi: *${updatedUser.pangkat}* (Level ${updatedUser.level}).\n\n_Segera perbaiki kinerja anda di grup!_`;

            await dashboardSock.sendMessage(groupId, { text: alertMsg, mentions: [updatedUser.jid] });
            break;
          }
        }
      } catch (notifErr) {
        logger.warn({ err: notifErr }, 'Gagal kirim notifikasi promosi/sanksi, XP tetap tersimpan');
      }
    }

    res.json({ success: true, message: `Operasi sukses! Jabatan: ${updatedUser.pangkat}`, data: updatedUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/rpg/cek-user', express.json(), requireLogin, async (req, res) => {
  let { jid } = req.body;
  if (!jid) return res.status(400).json({ error: 'JID / Nomor wajib diisi' });

  if (!dashboardSock) {
    return res.status(503).json({ error: 'Bot WhatsApp sedang tidak terhubung' });
  }

  let cleanJid = jid.trim();
  let isLid = cleanJid.endsWith('@lid');
  let targetNumber = "";

  if (!isLid) {
    targetNumber = cleanJid.split('@')[0].replace(/[^0-9]/g, '');
    if (targetNumber.startsWith('0')) {
      targetNumber = '62' + targetNumber.substring(1);
    }
    cleanJid = targetNumber + '@s.whatsapp.net';
  }

  try {
    const groups = await dashboardSock.groupFetchAllParticipating().catch(() => ({}));
    const groupIds = Object.keys(groups);
    const userGroups = [];

    for (const groupId of groupIds) {
      try {
        const groupMeta = await dashboardSock.groupMetadata(groupId);
        const participants = groupMeta.participants || [];

        let found = false;
        for (const p of participants) {
          const participantId = typeof p === 'object' && p !== null ? p.id : p;

          if (isLid) {
            if (participantId === cleanJid) found = true;
          } else {
            const participantNumber = String(participantId).split('@')[0].split(':')[0];
            if (participantNumber === targetNumber) found = true;
          }
          if (found) break;
        }

        if (found) {
          userGroups.push(groupMeta.subject || 'Grup Tanpa Nama');
        }
      } catch (err) {
        // Abaikan error metadata satu grup
      }
    }
    res.json({ success: true, groups: userGroups });
  } catch (error) {
    logger.error({ err: error }, 'Gagal cek user RPG');
    res.status(500).json({ error: 'Gagal mengecek data grup user' });
  }
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
