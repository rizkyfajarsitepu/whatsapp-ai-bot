export function getMenuText() {
  return `*[ ${'*'} RYZARSAI BOT MENU ${'*'} ]\n\n` +

    `💬 Kirim pesan apa saja → AI Auto-reply\n\n` +
    `🖼️ !stiker / !s → Gambar ke Stiker\n` +
    `🔊 !tts <teks> → Text to Speech (Voice Note)\n` +
    `🎙️ !transkrip → Transkripsi Voice Note\n\n` +
    `📥 !dl <link> → Download YouTube/TikTok/IG/FB\n` +
    `✂️ !hapusbg → Hapus Background Gambar\n` +
    `📄 !kepdf → Gambar ke PDF\n\n` +
    `📱 !qr <teks> → Generate QR Code\n` +
    `🔗 !short <url> → URL Shortener\n` +
    `🧮 !hitung <ekspresi> → Kalkulator\n` +
    `🕐 !sholat <kota> → Jadwal Sholat\n` +
    `🌤️ !cuaca <kota> → Info Cuaca\n` +
    `💱 !kurs <dari> <ke> <jumlah> → Kurs Mata Uang\n` +
    `🪙 !crypto <koin> → Harga Kripto\n\n` +

    `_Bot menggunakan AI Gemini & berbagai API publik._`;
}

export async function handleMenu(sock, msg) {
  const chatId = msg.key.remoteJid;
  const menuText = getMenuText();

  await sock.sendMessage(chatId, { text: menuText });

  console.log(`📤 [Menu] Menu dikirim ke ${chatId}`);
}
