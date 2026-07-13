import googleTts from 'google-tts-api';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough, Readable } from 'stream';

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}

function convertMp3ToOggOpus(inputBuffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const passthrough = new PassThrough();

    passthrough.on('data', (chunk) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    passthrough.on('error', reject);

    const input = bufferToStream(inputBuffer);
    ffmpeg(input)
      .inputOptions('-f mp3')
      .audioCodec('libopus')
      .format('ogg')
      .on('error', reject)
      .pipe(passthrough);
  });
}

export async function handleTTS(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !tts <teks yang akan diubah jadi suara>\nContoh: !tts Halo, apa kabar?',
    });
    return;
  }

  await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

  try {
    const text = args.trim();
    let audioUrl;

    if (text.length <= 200) {
      audioUrl = googleTts.getAudioUrl(text, { lang: 'id', slow: false, host: 'https://translate.google.com' });
    } else {
      const urls = googleTts.getAllAudioUrls(text, { lang: 'id', slow: false, host: 'https://translate.google.com' });
      audioUrl = urls[0].url;
    }

    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Gagal fetch audio: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const mp3Buffer = Buffer.from(arrayBuffer);

    const oggBuffer = await convertMp3ToOggOpus(mp3Buffer);

    const targetJid = msg.key.remoteJid;
    await sock.sendMessage(targetJid, {
      audio: oggBuffer,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
    }, { quoted: msg });

    console.log(`📤 [TTS] Voice note terkirim ke ${targetJid}`);
  } catch (err) {
    console.error('[TTS] Error:', err);
    await sock.sendMessage(chatId, {
      text: 'Gagal mengubah teks menjadi suara. Coba lagi nanti.',
    });
  }
}
