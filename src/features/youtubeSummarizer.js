import { GoogleGenAI } from '@google/genai';
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';
import { config } from '../config/settings.js';
import logger from '../utils/logger.js';

const MAX_TRANSCRIPT_LENGTH = 30000;

let genAI;

function getGenAI() {
  if (!genAI) genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  return genAI;
}

export async function handleYoutubeSummary(sock, msg, args) {
  const chatId = msg.key.remoteJid;
  const url = args?.trim();

  if (!url) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan format: !ringkas <link_youtube>\n\nContoh:\n!ringkas https://youtu.be/dQw4w9WgXcQ',
    });
    return;
  }

  await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(url);

    const fullText = transcriptItems
      .map((item) => item.text)
      .join(' ')
      .slice(0, MAX_TRANSCRIPT_LENGTH);

    const prompt =
      'Berikut adalah transkrip dari sebuah video YouTube. ' +
      'Tolong buatkan ringkasan yang komprehensif, poin-poin utama yang dibahas, dan kesimpulan dari video ini. ' +
      'Gunakan bahasa Indonesia yang santai tapi rapi.\n\nTranskrip:\n' +
      fullText;

    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const reply = response.text || 'Maaf, gagal merangkum video ini.';
    await sock.sendMessage(chatId, { text: reply });
    logger.info({ jid: chatId, url }, 'Ringkasan YouTube terkirim');
  } catch (err) {
    if (err instanceof YoutubeTranscriptDisabledError || err instanceof YoutubeTranscriptNotAvailableError) {
      await sock.sendMessage(chatId, {
        text: 'Maaf, video ini tidak memiliki subtitle/transkrip yang bisa saya baca.',
      });
    } else if (err instanceof YoutubeTranscriptVideoUnavailableError) {
      await sock.sendMessage(chatId, {
        text: 'Maaf, video tersebut tidak tersedia atau tidak dapat diakses.',
      });
    } else {
      logger.error({ jid: chatId, err: err.message }, 'Error ringkas YouTube');
      await sock.sendMessage(chatId, {
        text: 'Gagal merangkum video. Pastikan link benar dan video memiliki subtitle/CC.',
      });
    }
  }
}
