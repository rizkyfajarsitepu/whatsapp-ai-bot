import { config } from '../config/settings.js';
import logger from '../utils/logger.js';

export function getMenuText(featureToggles = {}) {
  const t = featureToggles;
  const any = (...keys) => keys.some(k => t[k] !== false);

  let text = `🤖 *${config.BOT_NAME} MENU* 🤖\n\n`;

  if (any('ai_chat', 'persona')) {
    text += `───────────────\n`;
    text += `*AI & CHAT*\n`;
    if (t.ai_chat !== false) text += `💬 Kirim pesan → Chat dengan AI\n`;
    if (t.persona !== false) text += `🎭 !mode <pacar|tsundere|auto> — Mode Persona AI\n`;
    text += '\n';
  }

  if (any('stiker', 'image_tools', 'tts', 'stt', 'ringkas')) {
    text += `───────────────\n`;
    text += `*MEDIA AI*\n`;
    if (t.stiker !== false) text += `🖼️ !stiker / !s — Gambar ke Stiker\n`;
    if (t.image_tools !== false) text += `🎨 !gambar <deskripsi> — AI Image Generator\n`;
    if (t.tts !== false) text += `🔊 !tts <teks> — Teks ke Suara (VN)\n`;
    if (t.stt !== false) text += `🎙️ !transkrip — VN ke Teks\n`;
    if (t.ringkas !== false) text += `📹 !ringkas <link> — Bedah Video YouTube\n`;
    text += '\n';
  }

  if (any('downloader', 'image_tools')) {
    text += `───────────────\n`;
    text += `*DOWNLOADER*\n`;
    if (t.downloader !== false) text += `📥 !dl <link> — Download YT/TT/IG/FB\n`;
    if (t.image_tools !== false) text += `✂️ !hapusbg — Hapus Background\n`;
    if (t.image_tools !== false) text += `📄 !kepdf — Gambar ke PDF\n`;
    text += '\n';
  }

  if (any('utility_tools')) {
    text += `───────────────\n`;
    text += `*UTILITAS*\n`;
    if (t.utility_tools !== false) text += `📱 !qr <teks> — Generate QR Code\n`;
    if (t.utility_tools !== false) text += `🔗 !short <url> — URL Shortener\n`;
    if (t.utility_tools !== false) text += `🧮 !hitung <rumus> — Kalkulator\n`;
    text += '\n';
  }

  if (any('info_tools')) {
    text += `───────────────\n`;
    text += `*INFO & DATA*\n`;
    if (t.info_tools !== false) text += `🕐 !sholat <kota> — Jadwal Sholat\n`;
    if (t.info_tools !== false) text += `🌤️ !cuaca <kota> — Info Cuaca\n`;
    if (t.info_tools !== false) text += `💱 !kurs <dari> <ke> — Kurs Mata Uang\n`;
    if (t.info_tools !== false) text += `🪙 !crypto <koin> — Harga Kripto\n`;
    text += '\n';
  }

  if (any('menfess')) {
    text += `───────────────\n`;
    text += `*SOSIAL*\n`;
    if (t.menfess !== false) text += `💌 !menfess <nomor> | <pesan> — Kirim Pesan Rahasia\n`;
    text += '\n';
  }

  text += `───────────────\n`;
  text += `*BANTUAN*\n`;
  text += `📋 !menu / !help — Tampilkan menu ini\n\n`;

  text += `_Gunakan ! sebelum command. Contoh: !stiker, !tts halo_`;

  return text;
}

export async function handleMenu(sock, msg, featureToggles) {
  const chatId = msg.key.remoteJid;
  const menuText = getMenuText(featureToggles);

  await sock.sendMessage(chatId, { text: menuText });

  logger.info({ jid: chatId }, 'Menu dikirim');
}
