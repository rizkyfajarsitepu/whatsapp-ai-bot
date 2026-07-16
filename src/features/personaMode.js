import logger from '../utils/logger.js';
import { chatWithCustomSystem } from '../ai/geminiClient.js';
import axios from 'axios';

export const activePersonas = new Map();

const personaPrompts = {
  pacar: 'Kamu adalah pacar virtual yang manja, perhatian, dan agak cemburuan. Gunakan bahasa gaul Indonesia. Jawab singkat maksimal 2 kalimat.',
  tsundere: "Kamu karakter tsundere. Galak, gengsi, suka bilang 'Bukan berarti aku peduli ya!', tapi sebenarnya perhatian. Jawab maksimal 2 kalimat.",
  auto: 'Kamu adalah AI berempati tinggi. Deteksi emosi/mood dari pesan user, lalu sesuaikan gaya bahasamu. Jika dia sedih, hibur dia. Jika marah, tenangkan atau ikut ngegas. Jika bercanda, balas sarkas/asyik. Gunakan bahasa gaul santai. Jawab maksimal 2 kalimat.',
};

export async function handleToggleMode(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args) {
    await sock.sendMessage(chatId, {
      text: '🎭 *Mode Persona*\n\nPilih mode:\n!mode pacar — Pacar virtual manja\n!mode tsundere — Tsundere galak\n!mode auto — Deteksi emosi otomatis\n!mode off — Matikan mode persona',
    });
    logger.warn({ jid: chatId }, 'Toggle mode: args kosong');
    return;
  }

  const mode = args.toLowerCase().trim();

  if (mode === 'off') {
    activePersonas.delete(chatId);
    await sock.sendMessage(chatId, { text: '✅ Mode Persona dimatikan.' });
    logger.info({ jid: chatId }, 'Persona mode: off');
    return;
  }

  if (personaPrompts[mode]) {
    activePersonas.set(chatId, mode);
    await sock.sendMessage(chatId, {
      text: `✅ Mode *${mode}* diaktifkan! Sekarang kirim pesan biasa tanpa command ya.`,
    });
    logger.info({ jid: chatId, mode }, 'Persona mode: ON');
  } else {
    await sock.sendMessage(chatId, {
      text: `❌ Mode *${args}* tidak tersedia. Gunakan: pacar, tsundere, auto, atau off.`,
    });
    logger.warn({ jid: chatId, mode: args }, 'Toggle mode: tidak dikenal');
  }
}

export async function handlePersonaChat(sock, msg, text) {
  const chatId = msg.key.remoteJid;
  const mode = activePersonas.get(chatId);
  const systemPrompt = personaPrompts[mode];

  await sock.sendMessage(chatId, { react: { text: '🎭', key: msg.key } });

  try {
    const reply = await chatWithCustomSystem(chatId, text, systemPrompt);

    const response = await axios.post(
      'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL',
      {
        text: reply,
        model_id: 'eleven_multilingual_v2',
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          Accept: 'audio/mpeg',
        },
        responseType: 'arraybuffer',
      },
    );

    const audioBuffer = Buffer.from(response.data);

    await sock.sendMessage(chatId, {
      audio: audioBuffer,
      mimetype: 'audio/mp4',
      ptt: true,
    }, { quoted: msg });

    logger.info({ jid: chatId, mode, reply }, 'Persona chat + VN terkirim');
  } catch (err) {
    logger.error({ jid: chatId, mode, err }, 'Persona chat error');
    await sock.sendMessage(chatId, {
      text: '❌ Gagal memproses mode persona. Coba lagi nanti.',
    });
  }
}
