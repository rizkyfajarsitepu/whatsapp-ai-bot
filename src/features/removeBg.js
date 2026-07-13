import axios from 'axios';
import FormData from 'form-data';
import { downloadMedia, getQuotedMessage, getMediaType } from '../utils/mediaHelper.js';
import { config } from '../config/settings.js';

export async function handleRemoveBg(sock, msg) {
  const chatId = msg.key.remoteJid;

  let targetMsg = null;
  let mediaType = null;

  const quoted = getQuotedMessage(msg);
  if (quoted) {
    targetMsg = quoted;
    mediaType = getMediaType(quoted);
  }

  if (mediaType !== 'image') {
    await sock.sendMessage(chatId, {
      text: 'Reply atau kirim gambar dengan command !hapusbg\n\nPastikan kamu memiliki REMOVE_BG_API_KEY di .env',
    });
    return;
  }

  const apiKey = config.REMOVE_BG_API_KEY;
  if (!apiKey) {
    await sock.sendMessage(chatId, {
      text: ' REMOVE_BG_API_KEY belum dikonfigurasi. Silakan tambahkan ke file .env.',
    });
    return;
  }

  await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

  try {
    const imageBuffer = await downloadMedia(sock, targetMsg);

    const form = new FormData();
    form.append('image_file', imageBuffer, {
      filename: 'image.jpg',
      contentType: 'image/jpeg',
    });
    form.append('size', 'auto');

    const response = await axios.post(
      'https://api.remove.bg/v1.0/removebg',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'X-Api-Key': apiKey,
        },
        responseType: 'arraybuffer',
        timeout: 60000,
      }
    );

    if (response.status !== 200) {
      const errorText = Buffer.from(response.data).toString('utf-8');
      throw new Error(`Remove.bg error: ${response.status} - ${errorText}`);
    }

    const resultBuffer = Buffer.from(response.data);

    await sock.sendMessage(chatId, {
      image: resultBuffer,
      mimetype: 'image/png',
      caption: 'Background berhasil dihapus!',
    });

    console.log(`📤 [RemoveBg] Hasil terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[RemoveBg] Error:', err);
    let errorMsg = 'Gagal menghapus background. Coba lagi nanti.';

    if (err.response?.status === 402) {
      errorMsg = 'Remove.bg API: Kuota habis atau API key tidak valid.';
    } else if (err.response?.status === 403) {
      errorMsg = 'Remove.bg API: API key tidak valid atau belum diaktifkan.';
    } else if (err.response?.status === 429) {
      errorMsg = 'Remove.bg API: Terlalu banyak request. Coba lagi nanti.';
    }

    await sock.sendMessage(chatId, { text: errorMsg });
  }
}
