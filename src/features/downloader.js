import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execFileAsync = promisify(execFile);

const YTDLP_PATH = 'C:\\Users\\USER\\AppData\\Local\\Microsoft\\WinGet\\Links\\yt-dlp.exe';
const TEMP_DIR = path.join(os.tmpdir(), 'bot-downloads');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {}
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/i.test(url);
}

function isTikTokUrl(url) {
  return /tiktok\.com/i.test(url);
}

function isInstagramUrl(url) {
  return /instagram\.com/i.test(url);
}

function isFacebookUrl(url) {
  return /facebook\.com|fb\.watch/i.test(url);
}

function isSupportedUrl(url) {
  return isYouTubeUrl(url) || isTikTokUrl(url) || isInstagramUrl(url) || isFacebookUrl(url);
}

async function downloadWithYtdlp(url, outputPath) {
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--concurrent-fragments', '4',
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '-o', outputPath,
    url,
  ];

  const { stdout, stderr } = await execFileAsync(YTDLP_PATH, args, {
    timeout: 120000,
    maxBuffer: 50 * 1024 * 1024,
  });

  return { stdout, stderr };
}

async function getInfoWithYtdlp(url) {
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--dump-json',
    url,
  ];

  const { stdout } = await execFileAsync(YTDLP_PATH, args, {
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(stdout);
}

export async function handleDownloader(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !dl <link>\nContoh: !dl https://youtube.com/watch?v=xxx\n\nPlatform yang didukung: YouTube, TikTok, Instagram, Facebook',
    });
    return;
  }

  const url = args.trim();

  if (!isSupportedUrl(url)) {
    await sock.sendMessage(chatId, {
      text: 'Link tidak didukung. Gunakan link dari YouTube, TikTok, Instagram, atau Facebook.',
    });
    return;
  }

  await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

  const timestamp = Date.now();
  const outputTemplate = path.join(TEMP_DIR, `${timestamp}.%(ext)s`);

  try {
    let info;
    try {
      info = await getInfoWithYtdlp(url);
    } catch {
      info = null;
    }

    const title = info?.title || 'Video';
    const duration = info?.duration;
    const uploader = info?.uploader || info?.channel || 'Unknown';

    if (duration && duration > 600) {
      await sock.sendMessage(chatId, {
        text: `Video terlalu panjang (${Math.floor(duration / 60)} menit). Batas maksimal 10 menit.`,
      });
      return;
    }

    await sock.sendMessage(chatId, {
      text: `Mengunduh: *${title}*\nCreator: ${uploader}\nHarap tunggu...`,
    });

    await downloadWithYtdlp(url, outputTemplate);

    const files = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(`${timestamp}.`));

    if (files.length === 0) {
      throw new Error('File tidak ditemukan setelah download');
    }

    const downloadedFile = path.join(TEMP_DIR, files[0]);
    const fileStat = fs.statSync(downloadedFile);
    const fileSizeMB = fileStat.size / (1024 * 1024);

    if (fileSizeMB > 100) {
      cleanupFile(downloadedFile);
      await sock.sendMessage(chatId, {
        text: `Ukuran file terlalu besar (${fileSizeMB.toFixed(1)} MB). Batas maksimal 100 MB.`,
      });
      return;
    }

    const ext = path.extname(files[0]).toLowerCase();
    const isVideo = ['.mp4', '.mkv', '.webm', '.avi'].includes(ext);
    const isAudio = ['.mp3', '.m4a', '.ogg', '.opus', '.wav'].includes(ext);
    const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);

    let mimetype = 'application/octet-stream';
    if (isVideo) mimetype = 'video/mp4';
    else if (isAudio) mimetype = 'audio/mpeg';
    else if (isImage) mimetype = 'image/jpeg';

    const fileBuffer = fs.readFileSync(downloadedFile);

    await sock.sendMessage(chatId, {
      document: fileBuffer,
      fileName: files[0],
      mimetype,
      caption: `*${title}*\nUkuran: ${fileSizeMB.toFixed(1)} MB`,
    });

    console.log(`📤 [Downloader] File terkirim ke ${chatId}: ${files[0]}`);
  } catch (err) {
    console.error('[Downloader] Error:', err);
    await sock.sendMessage(chatId, {
      text: `Gagal mengunduh media. Error: ${err.message}`,
    });
  } finally {
    const remaining = fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith(`${timestamp}.`));
    remaining.forEach((f) => cleanupFile(path.join(TEMP_DIR, f)));
  }
}
