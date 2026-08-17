import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger.js';
import { handleWelcomeEvent } from '../events/welcome.js';

const baileysLogger = logger.child({ module: 'baileys' }, { level: 'silent' });

const AUTH_DIR = path.resolve('auth_info');
const RESTART_DELAY_MS = 3000;
const VERSION_FETCH_TIMEOUT_MS = 10000;
const FALLBACK_VERSION = [2, 3000, 0];

let restartTimer = null;
let isStarting = false;
let currentSock = null;
let cachedVersion = null;

function clearAuthState() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      for (const file of fs.readdirSync(AUTH_DIR)) {
        fs.rmSync(path.join(AUTH_DIR, file), { force: true });
      }
    }
    logger.info('Sesi WhatsApp lama berhasil dihapus.');
  } catch (err) {
    logger.warn({ err }, 'Gagal menghapus sesi lama');
  }
}

async function getBaileysVersion() {
  if (cachedVersion) return { version: cachedVersion };

  try {
    const result = await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout fetch versi Baileys')), VERSION_FETCH_TIMEOUT_MS)
      ),
    ]);
    cachedVersion = result.version;
    return result;
  } catch (err) {
    logger.warn({ err }, 'Gagal fetch versi Baileys, pakai versi fallback');
    return { version: FALLBACK_VERSION };
  }
}

export async function startBot(messageHandler, featureToggles = {}, onSocketChange = () => {}) {
  if (isStarting) {
    logger.info('StartBot dilewati — koneksi masih dalam proses start');
    return currentSock;
  }
  isStarting = true;

  try {
    if (currentSock) {
      try {
        currentSock.end();
        currentSock.ev.removeAllListeners();
      } catch (err) {
        logger.warn({ err }, 'Gagal menutup socket lama');
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const { version } = await getBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: baileysLogger,
      printQRInTerminal: false,
      browser: ['WhatsApp AI Bot', 'Safari', '3.0'],
      markOnlineOnConnect: true,
    });

    currentSock = sock;

    onSocketChange(sock);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n--- SCAN QR CODE DI BAWAH INI ---\n');
        qrcode.generate(qr, { small: true });
        console.log('\n----------------------------------\n');
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = reason === DisconnectReason.loggedOut;

        logger.warn({ reason, shouldReconnect: !isLoggedOut }, 'Koneksi terputus');

        if (isLoggedOut) {
          logger.fatal('Sesi WhatsApp tidak valid (logged out). Menghapus sesi lama untuk meminta QR ulang...');
          clearAuthState();
        }

        logger.info('Mencoba restart koneksi dalam 3 detik...');
        clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
          startBot(messageHandler, featureToggles, onSocketChange).catch((err) => {
            logger.fatal({ err }, 'Gagal restart koneksi');
          });
        }, RESTART_DELAY_MS);
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
  } finally {
    isStarting = false;
  }
}
