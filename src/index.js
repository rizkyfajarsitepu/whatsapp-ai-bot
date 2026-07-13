import { startBot } from './core/connection.js';
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
import { checkRateLimit, getRateLimitMessage } from './middlewares/rateLimiter.js';
import logger from './utils/logger.js';

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

  if (!text) return;

  await handleWelcome(sock, chatId, senderName);

  const { cmd, args } = getCommand(text);

  logger.info({ sender: senderName, jid: chatId, text }, 'Pesan diterima');

  const isCommand = cmd && commands[cmd];
  if (isCommand) {
    const allowed = await checkRateLimit(chatId);
    if (!allowed) {
      await sock.sendMessage(chatId, { text: getRateLimitMessage() });
      logger.warn({ jid: chatId }, 'Rate limit terkena');
      return;
    }

    try {
      await commands[cmd](sock, msg, args);
      logger.info({ command: cmd, jid: chatId }, 'Command dieksekusi');
    } catch (err) {
      logger.error({ command: cmd, jid: chatId, err }, 'Error command');
      await sock.sendMessage(chatId, {
        text: `Terjadi error saat memproses !${cmd}. Coba lagi.`,
      });
    }
    return;
  }

  const allowed = await checkRateLimit(chatId);
  if (!allowed) {
    await sock.sendMessage(chatId, { text: getRateLimitMessage() });
    logger.warn({ jid: chatId }, 'Rate limit terkena (AI)');
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
  initSTT();
  await startBot(handleMessage);
}

main().catch((err) => {
  logger.fatal(err, 'Fatal error — bot mati');
  process.exit(1);
});
