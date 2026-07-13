import QRCode from 'qrcode';
import { evaluate } from 'mathjs';
import axios from 'axios';

export async function handleQR(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !qr <teks/URL>\nContoh: !qr https://google.com',
    });
    return;
  }

  try {
    const qrBuffer = await QRCode.toBuffer(args.trim(), {
      type: 'png',
      width: 512,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    await sock.sendMessage(chatId, {
      image: qrBuffer,
      caption: `QR Code untuk: ${args.trim()}`,
    });

    console.log(`📤 [QR] QR Code terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[QR] Error:', err);
    await sock.sendMessage(chatId, {
      text: 'Gagal membuat QR Code. Pastikan teks tidak terlalu panjang.',
    });
  }
}

export async function handleShort(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !short <url>\nContoh: !short https://google.com',
    });
    return;
  }

  const url = args.trim();

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    await sock.sendMessage(chatId, {
      text: 'URL harus diawali dengan http:// atau https://',
    });
    return;
  }

  try {
    const response = await axios.get(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { timeout: 10000 }
    );

    const shortUrl = response.data;

    if (!shortUrl || shortUrl.includes('Error')) {
      throw new Error('Gagal memendekkan URL');
    }

    await sock.sendMessage(chatId, {
      text: `*URL Asli:* ${url}\n*URL Pendek:* ${shortUrl}`,
    });

    console.log(`📤 [Short] URL dipendekkan ke ${chatId}: ${shortUrl}`);
  } catch (err) {
    console.error('[Short] Error:', err);
    await sock.sendMessage(chatId, {
      text: 'Gagal memendekkan URL. Coba lagi nanti.',
    });
  }
}

export async function handleHitung(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !hitung <ekspresi matematika>\nContoh: !hitung 2 + 3 * 4\n\nDidukung: +, -, *, /, ^, sqrt, sin, cos, tan, dll.',
    });
    return;
  }

  try {
    const result = evaluate(args.trim());

    await sock.sendMessage(chatId, {
      text: `*Ekspresi:* ${args.trim()}\n*Hasil:* ${result}`,
    });

    console.log(`📤 [Hitung] Hasil terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[Hitung] Error:', err);
    await sock.sendMessage(chatId, {
      text: `Error: Ekspresi matematika tidak valid.\n\nGunakan: !hitung <ekspresi>\nContoh: !hitung 2 + 3 * 4`,
    });
  }
}
