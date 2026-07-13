import sharp from 'sharp';
import { downloadMedia, getQuotedMessage, getMediaType } from '../utils/mediaHelper.js';

export const STICKER_SIZE = 512;

export async function handleSticker(sock, msg, textContent) {
  const chatId = msg.key.remoteJid;

  let targetMsg = msg;
  let mediaType = getMediaType(msg);

  if (!mediaType && msg.message?.extendedTextMessage) {
    const quoted = getQuotedMessage(msg);
    if (quoted) {
      targetMsg = quoted;
      mediaType = getMediaType(quoted);
    }
  }

  if (mediaType !== 'image') {
    await sock.sendMessage(chatId, {
      text: 'Kirim atau reply gambar dengan command !stiker atau !s',
    });
    return;
  }

  await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

  try {
    const buffer = await downloadMedia(sock, targetMsg);

    const webpBuffer = await sharp(buffer)
      .resize(STICKER_SIZE, STICKER_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toBuffer();

    await sock.sendMessage(chatId, {
      sticker: webpBuffer,
      mimetype: 'image/webp',
    });

    console.log(`📤 [Sticker] Stiker berhasil dikirim ke ${chatId}`);
  } catch (err) {
    console.error('[Sticker] Error:', err);
    await sock.sendMessage(chatId, {
      text: 'Gagal membuat stiker. Coba lagi dengan gambar lain.',
    });
  }
}
