import { config } from '../config/settings.js';
import logger from '../utils/logger.js';

export function getMenuText() {
  return (
    `╔══════════════════════╗\n` +
    `║  *${config.BOT_NAME} MENU*  ║\n` +
    `╚══════════════════════╝\n\n` +

    `┌──────────────────────┐\n` +
    `│  *AI & CHAT*          │\n` +
    `├──────────────────────┤\n` +
    `│ 💬 Kirim pesan biasa  │\n` +
    `│    → Auto-reply AI    │\n` +
    `└──────────────────────┘\n\n` +

    `┌──────────────────────┐\n` +
    `│  *MEDIA AI*           │\n` +
    `├──────────────────────┤\n` +
    `│ 🖼️ !stiker / !s      │\n` +
    `│    Gambar → Stiker    │\n` +
    `│ 🔊 !tts <teks>       │\n` +
    `│    Teks → Suara (VN)  │\n` +
    `│ 🎙️ !transkrip        │\n` +
    `│    VN → Teks          │\n` +
    `│ 📹 !ringkas <link>    │\n` +
    `│    Ringkasan YouTube   │\n` +
    `└──────────────────────┘\n\n` +

    `┌──────────────────────┐\n` +
    `│  *DOWNLOADER*         │\n` +
    `├──────────────────────┤\n` +
    `│ 📥 !dl <link>        │\n` +
    `│    YT/TikTok/IG/FB   │\n` +
    `│ ✂️ !hapusbg           │\n` +
    `│    Hapus Background   │\n` +
    `│ 📄 !kepdf             │\n` +
    `│    Gambar → PDF       │\n` +
    `└──────────────────────┘\n\n` +

    `┌──────────────────────┐\n` +
    `│  *UTILITAS*           │\n` +
    `├──────────────────────┤\n` +
    `│ 📱 !qr <teks>        │\n` +
    `│    Generate QR Code   │\n` +
    `│ 🔗 !short <url>       │\n` +
    `│    URL Shortener      │\n` +
    `│ 🧮 !hitung <rumus>    │\n` +
    `│    Kalkulator         │\n` +
    `└──────────────────────┘\n\n` +

    `┌──────────────────────┐\n` +
    `│  *INFO & DATA*        │\n` +
    `├──────────────────────┤\n` +
    `│ 🕐 !sholat <kota>    │\n` +
    `│    Jadwal Sholat      │\n` +
    `│ 🌤️ !cuaca <kota>     │\n` +
    `│    Info Cuaca         │\n` +
    `│ 💱 !kurs <dari> <ke> │\n` +
    `│    Kurs Mata Uang     │\n` +
    `│ 🪙 !crypto <koin>    │\n` +
    `│    Harga Kripto       │\n` +
    `└──────────────────────┘\n\n` +

    `┌──────────────────────┐\n` +
    `│  *BANTUAN*            │\n` +
    `├──────────────────────┤\n` +
    `│ 📋 !menu / !help     │\n` +
    `│    Tampilkan menu ini │\n` +
    `└──────────────────────┘\n\n` +

    `_Ketik ! diikuti nama command._\n` +
    `_Contoh: !stiker, !tts halo, !cuaca medan_`
  );
}

export async function handleMenu(sock, msg) {
  const chatId = msg.key.remoteJid;
  const menuText = getMenuText();

  await sock.sendMessage(chatId, { text: menuText });

  logger.info({ jid: chatId }, 'Menu dikirim');
}
