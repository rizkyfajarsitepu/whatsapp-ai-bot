import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import path from 'path';
import logger from '../utils/logger.js';
import { handleWelcomeEvent } from '../events/welcome.js';

const baileysLogger = logger.child({ module: 'baileys' }, { level: 'silent' });

export async function startBot(messageHandler, featureToggles = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.resolve('auth_info')
  );

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    printQRInTerminal: false,
    browser: ['WhatsApp AI Bot', 'Safari', '3.0'],
    markOnlineOnConnect: true,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n--- SCAN QR CODE DI BAWAH INI ---\n');
      qrcode.generate(qr, { small: true });
      console.log('\n----------------------------------\n');
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      logger.warn({ reason, shouldReconnect }, 'Koneksi terputus');

      if (shouldReconnect) {
        logger.info('Mencoba reconnect dalam 3 detik...');
        setTimeout(() => startBot(messageHandler, featureToggles), 3000);
      } else {
        logger.fatal('Logged out. Silakan scan QR ulang.');
      }
    }

    if (connection === 'open') {
      logger.info('Bot berhasil terhubung ke WhatsApp!');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) return;

      try {
        await messageHandler(sock, msg);
      } catch (err) {
        logger.error({ err }, 'Error memproses pesan');
      }
    }
  });

  handleWelcomeEvent(sock, featureToggles);

  return sock;
}
