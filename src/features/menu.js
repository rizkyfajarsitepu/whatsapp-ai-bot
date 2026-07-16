import { config } from '../config/settings.js';
import logger from '../utils/logger.js';

export function getMenuText() {
  return (
    `🤖 *${config.BOT_NAME} MENU* 🤖\n` +
    `Kirim pesan biasa langsung → Auto-reply AI\n\n` +

    `───────────────\n` +
    `*AI & CHAT*\n` +
    `💬 Kirim pesan → Chat dengan AI\n\n` +

    `───────────────\n` +
    `*MEDIA AI*\n` +
    `🖼️ !stiker / !s — Gambar ke Stiker\n` +
    `🎨 !gambar <deskripsi> — AI Image Generator\n` +
    `🔊 !tts <teks> — Teks ke Suara (VN)\n` +
    `🎙️ !transkrip — VN ke Teks\n` +
    `📹 !ringkas <link> — Bedah Video YouTube\n\n` +

    `───────────────\n` +
    `*DOWNLOADER*\n` +
    `📥 !dl <link> — Download YT/TT/IG/FB\n` +
    `✂️ !hapusbg — Hapus Background\n` +
    `📄 !kepdf — Gambar ke PDF\n\n` +

    `───────────────\n` +
    `*UTILITAS*\n` +
    `📱 !qr <teks> — Generate QR Code\n` +
    `🔗 !short <url> — URL Shortener\n` +
    `🧮 !hitung <rumus> — Kalkulator\n\n` +

    `───────────────\n` +
    `*INFO & DATA*\n` +
    `🕐 !sholat <kota> — Jadwal Sholat\n` +
    `🌤️ !cuaca <kota> — Info Cuaca\n` +
    `💱 !kurs <dari> <ke> — Kurs Mata Uang\n` +
    `🪙 !crypto <koin> — Harga Kripto\n\n` +

    `───────────────\n` +
    `*BANTUAN*\n` +
    `📋 !menu / !help — Tampilkan menu ini\n\n` +

    `_Gunakan ! sebelum command. Contoh: !stiker, !tts halo_`
  );
}

export async function handleMenu(sock, msg) {
  const chatId = msg.key.remoteJid;
  const menuText = getMenuText();

  await sock.sendMessage(chatId, { text: menuText });

  logger.info({ jid: chatId }, 'Menu dikirim');
}
