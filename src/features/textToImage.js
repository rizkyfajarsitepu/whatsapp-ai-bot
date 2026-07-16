import logger from '../utils/logger.js';

export async function handleTextToImage(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args) {
    await sock.sendMessage(chatId, {
      text: '⚠️ *Format salah!*\n\nContoh:\n!gambar kucing pakai kacamata hitam\n!imagine pemandangan gunung di malam hari',
    });
    logger.warn({ jid: chatId }, 'Text-to-image: args kosong');
    return;
  }

  await sock.sendMessage(chatId, {
    text: '⏳ *Sedang melukis gambar...* Tunggu sebentar ya!',
  });

  try {
    const prompt = encodeURIComponent(args);
    const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=1024&height=1024&nologo=true`;

    await sock.sendMessage(chatId, {
      image: { url: imageUrl },
      caption: `🎨 Hasil gambar untuk: *${args}*`,
    });

    logger.info({ jid: chatId, prompt: args }, 'Text-to-image berhasil');
  } catch (err) {
    logger.error({ jid: chatId, prompt: args, err }, 'Text-to-image error');
    await sock.sendMessage(chatId, {
      text: '❌ Gagal membuat gambar. Coba lagi nanti ya!',
    });
  }
}
