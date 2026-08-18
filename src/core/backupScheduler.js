import cron from 'node-cron';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from '../config/settings.js';
import logger from '../utils/logger.js';
import { getWIBTimestamp } from '../utils/dateTime.js';
import { uploadToDrive, isDriveReady, cleanupLocalFile, normalizeFolderId } from '../utils/googleDrive.js';

const DB_MIME_TYPE = 'application/vnd.sqlite3';

function getBackupFolderId() {
  return normalizeFolderId(config.GOOGLE_DRIVE_BACKUP_FOLDER_ID) || normalizeFolderId(config.GOOGLE_DRIVE_FOLDER_ID) || null;
}

export async function backupDatabase() {
  const dbPath = path.resolve(config.DB_PATH);

  if (!fs.existsSync(dbPath)) {
    logger.warn({ dbPath }, 'Database SQLite tidak ditemukan, backup dilewati');
    return false;
  }

  const tempBackupPath = path.join(os.tmpdir(), `chat_history_backup_${Date.now()}.db`);

  try {
    const db = new Database(dbPath);
    await db.backup(tempBackupPath);
    db.close();

    const fileBuffer = fs.readFileSync(tempBackupPath);
    cleanupLocalFile(tempBackupPath);

    const { date } = getWIBTimestamp();
    const fileName = `Chat_${date}.db`;

    const result = await uploadToDrive(fileBuffer, fileName, DB_MIME_TYPE, getBackupFolderId());

    if (result) {
      logger.info({ fileName, fileId: result.id }, 'Backup database berhasil diupload ke Google Drive');
      return true;
    }
    return false;
  } catch (err) {
    cleanupLocalFile(tempBackupPath);
    logger.error({ err }, 'Gagal backup database ke Google Drive');
    return false;
  }
}

export function startBackupScheduler() {
  if (!config.GOOGLE_DRIVE_BACKUP_ENABLED || !config.GOOGLE_DRIVE_ENABLED) {
    logger.info('Scheduler backup database dinonaktifkan');
    return null;
  }

  if (!isDriveReady()) {
    logger.warn('Google Drive belum siap, scheduler backup database tidak berjalan');
    return null;
  }

  const cronExpression = config.GOOGLE_DRIVE_BACKUP_CRON || '0 0 * * *';

  const task = cron.schedule(
    cronExpression,
    async () => {
      logger.info('Menjalankan backup database otomatis...');
      await backupDatabase();
    },
    { timezone: config.TIMEZONE || 'Asia/Jakarta' }
  );

  logger.info(`✅ Scheduler backup database aktif (cron: "${cronExpression}")`);

  if (config.GOOGLE_DRIVE_BACKUP_ON_START) {
    setTimeout(() => {
      backupDatabase().catch((err) => logger.error({ err }, 'Backup awal gagal'));
    }, 5000);
  }

  return task;
}