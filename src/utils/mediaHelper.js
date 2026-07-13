import { downloadMediaMessage, getContentType } from '@whiskeysockets/baileys';

export function getTextContent(msg) {
  const m = msg.message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    ''
  );
}

export function getCommand(text) {
  const match = text.trim().match(/^!([\w]+)\s*/);
  if (!match) return { cmd: null, args: text };
  return { cmd: match[1].toLowerCase(), args: text.slice(match[0].length).trim() };
}

export function getQuotedMessage(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  return {
    key: {
      remoteJid: msg.key.remoteJid,
      id: ctx.stanzaId,
      fromMe: false,
      participant: ctx.participant,
    },
    message: ctx.quotedMessage,
  };
}

export function getMediaType(msg) {
  const m = msg.message;
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.stickerMessage) return 'sticker';
  if (m.documentMessage) return 'document';
  return null;
}

export async function downloadMedia(sock, msg) {
  const buffer = await downloadMediaMessage(msg, 'buffer', {});
  return buffer;
}
