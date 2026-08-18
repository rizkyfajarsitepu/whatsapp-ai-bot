import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import { uploadToDrive } from '../utils/googleDrive.js';
import { getWIBTimestamp } from '../utils/dateTime.js';

const execFileAsync = promisify(execFile);

const YTDLP_PATH = 'yt-dlp';
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

const MAX_SEND_ATTEMPTS = 2;

async function sendMediaWithRetry(sock, chatId, content) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      await sock.sendMessage(chatId, content);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`[Downloader] Kirim media gagal (percobaan ${attempt}/${MAX_SEND_ATTEMPTS}): ${err.message}`);
      if (attempt < MAX_SEND_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr;
}

async function uploadMediaToDrive(fileBuffer, baseName, mimeType) {
  try {
    const fileName = `${baseName.replace(/[^\w\- .]+/g, '_').slice(0, 80)}`;
    const fileData = await uploadToDrive(fileBuffer, fileName, mimeType);
    if (fileData) {
      console.log(`☁️ [Downloader] Media disimpan ke Google Drive: ${fileName}`);
    }
  } catch (err) {
    console.error('[Downloader] Gagal upload media ke Google Drive:', err.message);
  }
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

async function downloadTikTok(url) {
  const { data } = await axios.get('https://tikwm.com/api/', {
    params: { url, hd: 1 },
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
  });

  if (data?.code !== 0 || !data?.data?.play) {
    throw new Error(data?.msg || 'Gagal mendapatkan URL video TikTok');
  }

  return {
    title: data.data.title || 'TikTok Video',
    uploader: data.data.author?.nickname || data.data.author?.unique_id || 'TikTok',
    videoUrl: data.data.play,
    duration: data.data.duration,
  };
}

function isSupportedUrl(url) {
  return isYouTubeUrl(url) || isTikTokUrl(url) || isInstagramUrl(url) || isFacebookUrl(url);
}

function getPlatformLabel(url) {
  if (isTikTokUrl(url)) return 'TikTok';
  if (isYouTubeUrl(url)) return 'YouTube';
  if (isInstagramUrl(url)) return 'Instagram';
  if (isFacebookUrl(url)) return 'Facebook';
  return 'Media';
}

function buildYtdlpArgs() {
  return [
    '--force-ipv4',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '20',
    '--retries', '3',
    '--extractor-args', 'youtube:player_client=android',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ];
}

async function downloadWithYtdlp(url, outputPath) {
  const args = [
    '--force-ipv4',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '20',
    '--retries', '3',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    '--extractor-args', 'youtube:player_client=android',
    '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[ext=mp4][height<=720]/b',
    '--merge-output-format', 'mp4',
    '-o', outputPath,
    url,
  ];

  const start = Date.now();
  const { stderr } = await execFileAsync(YTDLP_PATH, args, {
    timeout: 240000,
    maxBuffer: 50 * 1024 * 1024,
  });
  console.log(`[Downloader] yt-dlp selesai dalam ${((Date.now() - start) / 1000).toFixed(1)}s\n${stderr || ''}`);
}

async function getInfoWithYtdlp(url) {
  const args = [
    ...buildYtdlpArgs(),
    '--dump-json',
    url,
  ];

  const start = Date.now();
  const { stdout } = await execFileAsync(YTDLP_PATH, args, {
    timeout: 20000,
    maxBuffer: 10 * 1024 * 1024,
  });
  console.log(`[Downloader] Ekstraksi info selesai dalam ${((Date.now() - start) / 1000).toFixed(1)}s`);

  return JSON.parse(stdout);
}

async function runYtdlpFlow(sock, chatId, url, msg) {
  const timestamp = Date.now();
  const outputPath = path.join(TEMP_DIR, `${timestamp}.mp4`);

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
    return { status: 'skipped' };
  }

  await sock.sendMessage(chatId, {
    text: `Mengunduh: *${title}*\nCreator: ${uploader}\nHarap tunggu...`,
  });

  try {
    await downloadWithYtdlp(url, outputPath);

    if (!fs.existsSync(outputPath)) {
      throw new Error('File tidak ditemukan setelah download');
    }

    const fileStat = fs.statSync(outputPath);
    const fileSizeMB = fileStat.size / (1024 * 1024);

    if (fileSizeMB > 100) {
      await sock.sendMessage(chatId, {
        text: `Ukuran file terlalu besar (${fileSizeMB.toFixed(1)} MB). Batas maksimal 100 MB.`,
      });
      return { status: 'skipped' };
    }

    const fileBuffer = fs.readFileSync(outputPath);
    const isAudio = info?.ext === 'mp3' || info?.acodec === 'none' || (info?.vcodec === 'none' && info?.acodec);
    const { dateTime } = getWIBTimestamp();
    const platform = getPlatformLabel(url);

    const sendStart = Date.now();
    if (isAudio) {
      await sendMediaWithRetry(sock, chatId, {
        audio: fileBuffer,
        mimetype: 'audio/mpeg',
      });
      await uploadMediaToDrive(fileBuffer, `Audio_${dateTime}.mp3`, 'audio/mpeg');
    } else {
      await sendMediaWithRetry(sock, chatId, {
        video: fileBuffer,
        mimetype: 'video/mp4',
        caption: `*${title}*\nUkuran: ${fileSizeMB.toFixed(1)} MB`,
      });
      await uploadMediaToDrive(fileBuffer, `${platform}_${dateTime}.mp4`, 'video/mp4');
    }
    console.log(`[Downloader] Media terkirim ke ${chatId} dalam ${((Date.now() - sendStart) / 1000).toFixed(1)}s: ${path.basename(outputPath)}`);
    return { status: 'sent' };
  } finally {
    cleanupFile(outputPath);
  }
}

async function runTikTokApiFlow(sock, chatId, url, msg) {
  const tikInfo = await downloadTikTok(url);

  await sock.sendMessage(chatId, {
    text: `Mengunduh: *${tikInfo.title}*\nCreator: ${tikInfo.uploader}\nHarap tunggu...`,
  });

  const timestamp = Date.now();
  const outputPath = path.join(TEMP_DIR, `${timestamp}.mp4`);

  try {
    const videoResp = await axios.get(tikInfo.videoUrl, {
      responseType: 'stream',
      timeout: 120000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const writer = fs.createWriteStream(outputPath);
    videoResp.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const fileStat = fs.statSync(outputPath);
    const fileSizeMB = fileStat.size / (1024 * 1024);

    if (fileSizeMB > 100) {
      await sock.sendMessage(chatId, {
        text: `Ukuran file terlalu besar (${fileSizeMB.toFixed(1)} MB). Batas maksimal 100 MB.`,
      });
      return;
    }

    const fileBuffer = fs.readFileSync(outputPath);
    const { dateTime } = getWIBTimestamp();
    await sock.sendMessage(chatId, {
      video: fileBuffer,
      mimetype: 'video/mp4',
      caption: `*${tikInfo.title}*\nUkuran: ${fileSizeMB.toFixed(1)} MB`,
    });

    await uploadMediaToDrive(fileBuffer, `TikTok_${dateTime}.mp4`, 'video/mp4');
  } finally {
    cleanupFile(outputPath);
  }
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

  if (isTikTokUrl(url)) {
    try {
      await runTikTokApiFlow(sock, chatId, url, msg);
      return;
    } catch (tikErr) {
      console.error('[Downloader] TikTok API Error:', tikErr.message);
    }

    try {
      const result = await runYtdlpFlow(sock, chatId, url, msg);
      if (result?.status === 'sent' || result?.status === 'skipped') return;
    } catch (ytErr) {
      console.error('[Downloader] yt-dlp TikTok gagal:', ytErr.message);
    }

    await sock.sendMessage(chatId, {
      text: 'Gagal mengunduh TikTok. Coba lagi nanti ya.',
    });
    return;
  }

  try {
    await runYtdlpFlow(sock, chatId, url, msg);
  } catch (err) {
    console.error('[Downloader] Error:', err);
    const hint =
      err.message.includes('403') || err.message.includes('Forbidden')
        ? '\n\nTips: perbarui yt-dlp dengan perintah: pip install -U yt-dlp'
        : '';
    await sock.sendMessage(chatId, {
      text: `Gagal mengunduh media. Error: ${err.message}${hint}`,
    });
  }
}