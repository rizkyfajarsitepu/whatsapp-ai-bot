import { startBot } from './core/connection.js';
import { createCanvas, loadImage } from 'canvas';
import { initGemini, chatWithHistory } from './ai/geminiClient.js';
import { config } from './config/settings.js';
import { getTextContent, getCommand } from './utils/mediaHelper.js';
import { handleSticker } from './features/sticker.js';
import { handleTTS } from './features/tts.js';
import { initSTT, handleSTT } from './features/stt.js';
import { handleDownloader } from './features/downloader.js';
import { handleRemoveBg } from './features/removeBg.js';
import { handleImageToPdf } from './features/imageToPdf.js';
import { handleQR, handleShort, handleHitung } from './features/utilities.js';
import { handleSholat, handleCuaca, handleKurs, handleCrypto } from './features/infoApi.js';
import { handleMenu, getMenuText } from './features/menu.js';
import { initVision, handleProactiveVision } from './features/aiImageVision.js';
import { handleYoutubeSummary } from './features/youtubeSummarizer.js';
import { handleTextToImage } from './features/textToImage.js';
import { activePersonas, handleToggleMode, handlePersonaChat } from './features/personaMode.js';
import { startDashboard } from './dashboard/server.js';
import { checkRateLimit, getRateLimitMessage } from './middlewares/rateLimiter.js';
import logger from './utils/logger.js';

export const menfessSessions = new Map();

export const featureToggles = {
    ai_chat: true,
    stiker: true,
    tts: true,
    stt: true,
    downloader: true,
    image_tools: true,
    info_tools: true,
    utility_tools: true,
    ringkas: true,
    persona: true,
    menfess: true,
    welcome_canvas: true,
};

const featureMap = {
    stiker: 'stiker',
    s: 'stiker',
    tts: 'tts',
    transkrip: 'stt',
    dl: 'downloader',
    hapusbg: 'image_tools',
    kepdf: 'image_tools',
    qr: 'utility_tools',
    short: 'utility_tools',
    hitung: 'utility_tools',
    sholat: 'info_tools',
    cuaca: 'info_tools',
    kurs: 'info_tools',
    crypto: 'info_tools',
    ringkas: 'ringkas',
    gambar: 'image_tools',
    imagine: 'image_tools',
    mode: 'persona',
};

const commands = {
  stiker: handleSticker,
  s: handleSticker,
  tts: handleTTS,
  transkrip: handleSTT,
  dl: handleDownloader,
  hapusbg: handleRemoveBg,
  kepdf: handleImageToPdf,
  qr: handleQR,
  short: handleShort,
  hitung: handleHitung,
  sholat: handleSholat,
  cuaca: handleCuaca,
  kurs: handleKurs,
  crypto: handleCrypto,
  menu: handleMenu,
  help: handleMenu,
  ringkas: handleYoutubeSummary,
  gambar: handleTextToImage,
  imagine: handleTextToImage,
  mode: handleToggleMode,
};

const knownUsers = new Set();

async function handleWelcome(sock, chatId, senderName) {
  if (knownUsers.has(chatId)) return false;

  knownUsers.add(chatId);

  const welcomeText =
    `Halo *${senderName}*! 👋\n` +
    `Selamat datang di *${config.BOT_NAME}*.\n\n` +
    `Saya adalah bot WhatsApp yang bisa bantu kamu dengan banyak hal.\n\n` +
    `Ketik *!menu* untuk melihat semua fitur yang tersedia.\n` +
    `Atau langsung kirim pesan biasa untuk chat dengan AI.`;

  await sock.sendMessage(chatId, { text: welcomeText });
  logger.info({ jid: chatId, sender: senderName }, 'Welcome message terkirim');
  return true;
}

async function handleMessage(sock, msg) {
  const chatId = msg.key.remoteJid;
  const senderName = msg.pushName || 'User';
  const text = getTextContent(msg);
  const isImage = !!msg.message?.imageMessage;

  if (isImage && !text.startsWith('!')) {
    if (!featureToggles.ai_chat) return;
    await handleProactiveVision(sock, msg, text);
    return;
  }

  if (!text) return;

  console.log(`[Pesan Masuk] User: ${chatId} | Text: ${text}`);

  await handleWelcome(sock, chatId, senderName);

  const { cmd, args } = getCommand(text);

  logger.info({ sender: senderName, jid: chatId, text }, 'Pesan diterima');

  if (cmd === 'menfess') {
    if (!featureToggles.menfess) return sock.sendMessage(chatId, { text: '🚨 Fitur Menfess sedang dimatikan/maintenance.' });

    if (!args || !args.includes('|')) {
      return sock.sendMessage(chatId, { text: '⚠️ Format salah!\n\n*Cara pakai:*\n!menfess <nomor_tujuan> | <pesan>\n\n*Contoh:*\n!menfess 628123456789 | halo, aku suka kamu' });
    }

    let [targetNumber, ...menfessMsgArr] = args.split('|');
    targetNumber = targetNumber.trim();
    const menfessMsg = menfessMsgArr.join('|').trim();

    if (targetNumber.startsWith('0')) targetNumber = '62' + targetNumber.slice(1);
    const targetJid = targetNumber + '@s.whatsapp.net';

    if (targetJid === chatId) return sock.sendMessage(chatId, { text: '❌ Kamu tidak bisa mengirim pesan rahasia ke diri sendiri.' });

    menfessSessions.set(targetJid, chatId);

    const targetText = `💌 *ADA PESAN RAHASIA (MENFESS)* 💌\n\nDari seseorang:\n_"${menfessMsg}"_\n\n---\n_Ketik *!balasmenfess [pesan]* untuk membalas pesan ini tanpa membocorkan identitasmu._`;

    try {
      await sock.sendMessage(targetJid, { text: targetText });
      await sock.sendMessage(chatId, { text: '✅ Pesan rahasiamu telah berhasil dan aman dikirim ke target!' });
    } catch (err) {
      await sock.sendMessage(chatId, { text: '❌ Gagal mengirim menfess. Pastikan nomor tujuan terdaftar di WhatsApp.' });
    }
    return;
  }

  if (cmd === 'balasmenfess') {
    if (!featureToggles.menfess) return sock.sendMessage(chatId, { text: '🚨 Fitur Menfess sedang dimatikan.' });

    if (!args || !args.trim()) return sock.sendMessage(chatId, { text: '⚠️ Pesan balasan tidak boleh kosong!\n*Contoh:* !balasmenfess oh ya? siapa nih?' });

    if (!menfessSessions.has(chatId)) {
      return sock.sendMessage(chatId, { text: '❌ Kamu tidak memiliki pesan rahasia yang belum dibalas.' });
    }

    const originalSender = menfessSessions.get(chatId);
    menfessSessions.set(originalSender, chatId);

    const senderText = `💌 *BALASAN MENFESS* 💌\n\nTarget membalas:\n_"${args.trim()}"_\n\n---\n_Ketik *!balasmenfess [pesan]* untuk membalas balik._`;

    try {
      await sock.sendMessage(originalSender, { text: senderText });
      await sock.sendMessage(chatId, { text: '✅ Balasan berhasil dikirim secara anonim!' });
    } catch (err) {
      await sock.sendMessage(chatId, { text: '❌ Gagal mengirim balasan.' });
    }
    return;
  }

  const isCommand = cmd && commands[cmd];
  if (isCommand) {
    const featureKey = featureMap[cmd];
    if (featureKey && !featureToggles[featureKey]) {
      return sock.sendMessage(chatId, { text: `🚨 Mohon maaf, fitur *${cmd}* sedang maintenance.` });
    }

    const allowed = await checkRateLimit(chatId);
    if (!allowed) {
      await sock.sendMessage(chatId, { text: getRateLimitMessage() });
      logger.warn({ jid: chatId }, 'Rate limit terkena');
      return;
    }

    try {
      if (cmd === 'menu' || cmd === 'help') {
        await handleMenu(sock, msg, featureToggles);
      } else {
        await commands[cmd](sock, msg, args);
      }
      logger.info({ command: cmd, jid: chatId }, 'Command dieksekusi');
    } catch (err) {
      logger.error({ command: cmd, jid: chatId, err }, 'Error command');
      await sock.sendMessage(chatId, {
        text: `Terjadi error saat memproses !${cmd}. Coba lagi.`,
      });
    }
    return;
  }

  if (!featureToggles.ai_chat) {
    return sock.sendMessage(chatId, { text: '🚨 Mohon maaf, fitur AI Chat sedang maintenance.' });
  }

  const allowed = await checkRateLimit(chatId);
  if (!allowed) {
    await sock.sendMessage(chatId, { text: getRateLimitMessage() });
    logger.warn({ jid: chatId }, 'Rate limit terkena (AI)');
    return;
  }

  if (activePersonas.has(chatId)) {
    await handlePersonaChat(sock, msg, text);
    return;
  }

  try {
    const reply = await chatWithHistory(chatId, text);
    await sock.sendMessage(chatId, { text: reply });
    logger.info({ jid: chatId, sender: senderName }, 'AI reply terkirim');
  } catch (err) {
    logger.error({ jid: chatId, err }, 'Error AI reply');
    await sock.sendMessage(chatId, {
      text: 'Terjadi gangguan pada AI. Coba lagi nanti.',
    });
  }
}

process.on('uncaughtException', (err) => {
  logger.fatal(err, 'Uncaught Exception — bot tidak mati');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection');
});

async function main() {
  logger.info({ bot: config.BOT_NAME }, 'Bot starting...');
  initGemini();
  initVision();
  initSTT();
  const sock = await startBot(handleMessage);
  startDashboard(sock, featureToggles);

  // ==========================================
  // FITUR SAMBUTAN VISUAL KUSTOM (WELCOME CANVAS)
  // ==========================================
  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;

    console.log(`[🔍 RADAR GRUP] Aksi '${action}' terdeteksi di grup ${id}`);

    if (action === 'add') {
      if (featureToggles && !featureToggles.welcome_canvas) {
        console.log('[⚙️ SYSTEM] Fitur Welcome Canvas sedang OFF.');
        return;
      }

      try {
        console.log(`[⏳ PROSES WELCOME] Menyiapkan banner untuk ${participants.length} member baru...`);

        const groupMetadata = await sock.groupMetadata(id);
        const groupName = groupMetadata.subject;

        for (let num of participants) {
          let ppUrl;
          try {
            ppUrl = await sock.profilePictureUrl(num, 'image');
          } catch {
            console.log(`[ℹ️ INFO] ${num} tidak ada foto profil, pakai default.`);
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
          const captionMsg = `Halo @${memberName}! 👋\n\nSelamat datang di grup *${groupName}*.\nJangan lupa perkenalkan diri dan patuhi rules grup ya!`;

          await sock.sendMessage(id, {
            image: buffer,
            caption: captionMsg,
            mentions: [num]
          });
          console.log(`[✅ SUKSES] Banner welcome terkirim ke ${memberName}`);
        }
      } catch (err) {
        console.error('[❌ ERROR WELCOME CANVAS]', err.stack);
      }
    }
  });
}

main().catch((err) => {
  logger.fatal(err, 'Fatal error — bot mati');
  process.exit(1);
});
