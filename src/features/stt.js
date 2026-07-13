import { GoogleGenAI } from '@google/genai';
import { config } from '../config/settings.js';
import { downloadMedia, getQuotedMessage, getMediaType } from '../utils/mediaHelper.js';

let genAI = null;

export function initSTT() {
  genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
}

export async function handleSTT(sock, msg) {
  const chatId = msg.key.remoteJid;

  let targetMsg = null;
  let mediaType = null;

  const quoted = getQuotedMessage(msg);
  if (quoted) {
    targetMsg = quoted;
    mediaType = getMediaType(quoted);
  }

  if (mediaType !== 'audio') {
    await sock.sendMessage(chatId, {
      text: 'Reply voice note dengan command !transkrip untuk mentranskripnya.',
    });
    return;
  }

  if (!genAI) {
    initSTT();
  }

  await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

  try {
    const audioBuffer = await downloadMedia(sock, targetMsg);

    const audioPart = {
      inlineData: {
        mimeType: 'audio/ogg',
        data: audioBuffer.toString('base64'),
      },
    };

    const response = await genAI.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            audioPart,
            { text: 'Transkripsikan audio ini secara akurat dalam bahasa yang digunakan. Tulis hanya hasil transkripsinya saja, tanpa penjelasan tambahan.' },
          ],
        },
      ],
    });

    const transcript = response.text || 'Gagal mentranskrip audio.';

    await sock.sendMessage(chatId, {
      text: `*Hasil Transkrip:*\n\n${transcript}`,
    });

    console.log(`📤 [STT] Transkrip terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[STT] Error:', err);
    await sock.sendMessage(chatId, {
      text: 'Gagal mentranskrip voice note. Coba lagi nanti.',
    });
  }
}
