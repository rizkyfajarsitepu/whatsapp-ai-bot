import { GoogleGenAI } from '@google/genai';
import { downloadMedia } from '../utils/mediaHelper.js';
import { config } from '../config/settings.js';
import logger from '../utils/logger.js';

let genAI = null;

export function initVision() {
  genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  logger.info('✅ Vision module initialized');
}

export async function handleProactiveVision(sock, msg, caption = '') {
  const chatId = msg.key.remoteJid;
  const senderName = msg.pushName || 'User';

  await sock.sendMessage(chatId, { react: { text: '🔍', key: msg.key } });

  try {
    const buffer = await downloadMedia(sock, msg);
    const mimeType = msg.message?.imageMessage?.mimetype || 'image/jpeg';

    const imagePart = {
      inlineData: {
        mimeType,
        data: buffer.toString('base64'),
      },
    };

    let prompt =
      'Analisis gambar ini dengan detail dan akurat. ' +
      'Jika ada teks di dalamnya, bacakan teksnya. ' +
      'Jika ada pertanyaan dari user, jawablah berdasarkan konteks gambar.';

    if (caption) {
      prompt += `\n\nPertanyaan user: "${caption}"`;
    }

    const response = await genAI.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            imagePart,
          ],
        },
      ],
    });

    const reply = response.text || 'Maaf, saya tidak bisa menganalisis gambar ini.';
    await sock.sendMessage(chatId, { text: reply });
    logger.info({ jid: chatId, sender: senderName }, 'Vision analysis terkirim');
  } catch (err) {
    logger.error({ jid: chatId, err: err.message }, 'Error vision analysis');
    await sock.sendMessage(chatId, {
      text: 'Gagal menganalisis gambar. Coba lagi nanti.',
    });
  }
}
