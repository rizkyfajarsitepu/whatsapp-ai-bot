import { PDFDocument } from 'pdf-lib';
import { downloadMedia, getQuotedMessage, getMediaType } from '../utils/mediaHelper.js';

export async function handleImageToPdf(sock, msg) {
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
      text: 'Reply atau kirim gambar dengan command !kepdf\n\nGambar akan dikonversi menjadi file PDF.',
    });
    return;
  }

  await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

  try {
    const imageBuffer = await downloadMedia(sock, targetMsg);

    const pdfDoc = await PDFDocument.create();

    let image;
    const mimeType = targetMsg.message?.imageMessage?.mimetype || '';

    if (mimeType.includes('png')) {
      image = await pdfDoc.embedPng(imageBuffer);
    } else {
      image = await pdfDoc.embedJpg(imageBuffer);
    }

    const page = pdfDoc.addPage([image.width, image.height]);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = Buffer.from(pdfBytes);

    const fileName = `gambar_${Date.now()}.pdf`;

    await sock.sendMessage(chatId, {
      document: pdfBuffer,
      fileName,
      mimetype: 'application/pdf',
      caption: 'Gambar berhasil dikonversi ke PDF!',
    });

    console.log(`📤 [ImageToPdf] PDF terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[ImageToPdf] Error:', err);
    await sock.sendMessage(chatId, {
      text: 'Gagal mengkonversi gambar ke PDF. Coba lagi dengan gambar lain.',
    });
  }
}
