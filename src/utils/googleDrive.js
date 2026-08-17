import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import logger from './logger.js';
import { config } from '../config/settings.js';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

let drive = null;

function buildAuth() {
  const { GOOGLE_DRIVE_TYPE } = config;

  if (GOOGLE_DRIVE_TYPE === 'service_account') {
    if (config.GOOGLE_DRIVE_CREDENTIALS_PATH && fs.existsSync(config.GOOGLE_DRIVE_CREDENTIALS_PATH)) {
      const keyFile = JSON.parse(fs.readFileSync(config.GOOGLE_DRIVE_CREDENTIALS_PATH, 'utf-8'));
      return new google.auth.GoogleAuth({
        credentials: keyFile,
        scopes: DRIVE_SCOPES,
      });
    }

    if (config.GOOGLE_DRIVE_CLIENT_EMAIL && config.GOOGLE_DRIVE_PRIVATE_KEY) {
      return new google.auth.GoogleAuth({
        credentials: {
          client_email: config.GOOGLE_DRIVE_CLIENT_EMAIL,
          private_key: config.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: DRIVE_SCOPES,
      });
    }

    throw new Error('Konfigurasi Service Account tidak lengkap (cek GOOGLE_DRIVE_CREDENTIALS_PATH atau GOOGLE_DRIVE_CLIENT_EMAIL/PRIVATE_KEY di .env)');
  }

  if (GOOGLE_DRIVE_TYPE === 'oauth2') {
    if (!config.GOOGLE_DRIVE_CLIENT_ID || !config.GOOGLE_DRIVE_CLIENT_SECRET || !config.GOOGLE_DRIVE_REFRESH_TOKEN) {
      throw new Error('Konfigurasi OAuth2 tidak lengkap (cek GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN di .env)');
    }

    const auth = new google.auth.OAuth2(
      config.GOOGLE_DRIVE_CLIENT_ID,
      config.GOOGLE_DRIVE_CLIENT_SECRET,
      config.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost'
    );
    auth.setCredentials({ refresh_token: config.GOOGLE_DRIVE_REFRESH_TOKEN });
    return auth;
  }

  throw new Error(`Tipe Google Drive "${GOOGLE_DRIVE_TYPE}" tidak didukung. Gunakan "service_account" atau "oauth2".`);
}

export function initGoogleDrive() {
  if (drive) return drive;

  if (!config.GOOGLE_DRIVE_ENABLED) {
    logger.warn('Google Drive dinonaktifkan (GOOGLE_DRIVE_ENABLED=false). Semua upload dilewati.');
    return null;
  }

  try {
    const auth = buildAuth();
    drive = google.drive({ version: 'v3', auth });
    logger.info('✅ Google Drive API berhasil diinisialisasi');
  } catch (err) {
    logger.error({ err }, 'Gagal menginisialisasi Google Drive API');
    drive = null;
  }

  return drive;
}

export function isDriveReady() {
  return initGoogleDrive() !== null;
}

export async function uploadToDrive(fileBuffer, fileName, mimeType = 'application/octet-stream', folderId = config.GOOGLE_DRIVE_FOLDER_ID) {
  const drive = initGoogleDrive();
  if (!drive) {
    logger.warn({ fileName }, 'Upload ke Google Drive dilewati (Drive tidak siap)');
    return null;
  }

  const fileMetadata = { name: fileName };
  if (folderId) fileMetadata.parents = [folderId];

  try {
    const res = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType,
        body: Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer),
      },
      fields: 'id,name,mimeType,size,webViewLink',
    });

    logger.info({ fileId: res.data.id, name: res.data.name, size: res.data.size }, 'File berhasil diupload ke Google Drive');
    return res.data;
  } catch (err) {
    logger.error({ err, fileName }, 'Gagal upload ke Google Drive');
    throw err;
  }
}

export async function uploadFileFromPath(filePath, fileName, mimeType = 'application/octet-stream', folderId = config.GOOGLE_DRIVE_FOLDER_ID, deleteAfter = false) {
  if (!fs.existsSync(filePath)) {
    logger.warn({ filePath }, 'File tidak ditemukan, upload dilewati');
    return null;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const name = fileName || path.basename(filePath);

  try {
    const result = await uploadToDrive(fileBuffer, name, mimeType, folderId);
    if (deleteAfter) cleanupLocalFile(filePath);
    return result;
  } catch (err) {
    throw err;
  }
}

export function cleanupLocalFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info({ filePath }, 'File lokal dihapus setelah upload');
    }
  } catch (err) {
    logger.warn({ err, filePath }, 'Gagal menghapus file lokal');
  }
}

export function getDriveFolderId() {
  return config.GOOGLE_DRIVE_FOLDER_ID || null;
}