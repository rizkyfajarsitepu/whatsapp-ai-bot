import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import logger from '../utils/logger.js';

const baileysLogger = logger.child({ module: 'baileys' }, { level: 'silent' });

export async function startBot(messageHandler, featureToggles = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.resolve('auth_info')
  );

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    printQRInTerminal: false,
    browser: ['WhatsApp AI Bot', 'Safari', '3.0'],
    markOnlineOnConnect: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n--- SCAN QR CODE DI BAWAH INI ---\n');
      qrcode.generate(qr, { small: true });
      console.log('\n----------------------------------\n');
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      logger.warn({ reason, shouldReconnect }, 'Koneksi terputus');

      if (shouldReconnect) {
        logger.info('Mencoba reconnect dalam 3 detik...');
        setTimeout(() => startBot(messageHandler, featureToggles), 3000);
      } else {
        logger.fatal('Logged out. Silakan scan QR ulang.');
      }
    }

    if (connection === 'open') {
      logger.info('Bot berhasil terhubung ke WhatsApp!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) return;

      try {
        await messageHandler(sock, msg);
      } catch (err) {
        logger.error({ err }, 'Error memproses pesan');
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;

    console.log(`\n[🚨 BAILEYS EVENT] Mendapat update dari grup: ${id}`);
    console.log(`[🚨 BAILEYS EVENT] Aksi: ${action} | Peserta:`, participants);

    if (action !== 'add') return;

    if (featureToggles && featureToggles.welcome_canvas === false) {
      console.log('[⚙️ SYSTEM] Welcome Canvas OFF, membatalkan render.');
      return;
    }

    try {
      console.log(`[⏳ PROSES] Merender banner Welcome untuk ${participants.length} member baru...`);

      const groupMetadata = await sock.groupMetadata(id);
      const groupName = groupMetadata.subject || 'Grup WhatsApp';

      for (let num of participants) {
        let ppUrl;
        try {
          ppUrl = await sock.profilePictureUrl(num, 'image');
        } catch {
          ppUrl = 'https://i.ibb.co/3Fh9V6p/avatar-contact.png';
        }

        const canvas = createCanvas(800, 300);
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#0f2027');
        gradient.addColorStop(0.5, '#203a43');
        gradient.addColorStop(1, '#2c5364');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for (let i = 0; i < 100; i++) {
          ctx.beginPath();
          ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        const avatar = await loadImage(ppUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(150, 150, 100, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 50, 50, 200, 200);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(150, 150, 100, 0, Math.PI * 2, true);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 10;
        ctx.stroke();

        ctx.font = 'bold 55px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('WELCOME!', 300, 120);

        ctx.font = '30px Arial';
        ctx.fillStyle = '#cccccc';
        const memberName = num.split('@')[0];
        ctx.fillText(`@${memberName}`, 300, 170);

        ctx.font = 'bold 35px Arial';
        ctx.fillStyle = '#00ffcc';
        const shortGroupName = groupName.length > 22 ? groupName.substring(0, 22) + '...' : groupName;
        ctx.fillText(shortGroupName, 300, 230);

        const buffer = canvas.toBuffer('image/png');
        const captionMsg = `Halo @${memberName}! 👋\n\nSelamat datang di grup *${groupName}*.\nJangan lupa perkenalkan diri ya!`;

        await sock.sendMessage(id, {
          image: buffer,
          caption: captionMsg,
          mentions: [num]
        });
        console.log(`[✅ SUKSES] Canvas terkirim ke ${memberName}`);
      }
    } catch (err) {
      console.error('[❌ ERROR WELCOME CANVAS]', err.stack);
    }
  });

  return sock;
}
