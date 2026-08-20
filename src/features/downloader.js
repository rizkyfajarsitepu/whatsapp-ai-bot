import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import logger from '../utils/logger.js';
import { config } from '../config/settings.js';
import { uploadToDrive, normalizeFolderId } from '../utils/googleDrive.js';
import { getWIBTimestamp } from '../utils/dateTime.js';

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp';
const TEMP_DIR = path.join(process.cwd(), 'tmp');
const MAX_DURATION_SECONDS = 600;
const MAX_SEND_ATTEMPTS = 2;
const WHATSAPP_DOC_LIMIT_MB = 45;
const WHATSAPP_ABSOLUTE_LIMIT_MB = 100;

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info({ filePath }, 'File temporer dihapus');
    }
  } catch (err) {
    logger.warn({ err, filePath }, 'Gagal menghapus file temporer');
  }
}

function runSpawn(command, args, { timeoutMs = 300000, onLog } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    let child;
    try {
      child = spawn(command, args, { windowsHide: true });
    } catch (err) {
      reject(err);
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {}
      reject(new Error('Proses melebihi batas waktu.'));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      onLog?.(chunk);
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
      onLog?.(chunk);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return;

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const reason = signal
        ? `Proses dihentikan oleh sistem (${signal})`
        : stderr.trim() || `Keluar dengan kode ${code}`;
      const err = new Error(reason);
      err.stderr = stderr;
      err.code = code;
      reject(err);
    });
  });
}

function cleanUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.searchParams.delete('si');
    parsed.searchParams.delete('igsh');
    parsed.searchParams.delete('feature');
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

async function downloadWithYtdlp(url, outputBasePath) {
  const ytdlpArgs = [
    '--force-ipv4',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '60',
    '--retries', '5',
    '--match-filter', `duration <= ${MAX_DURATION_SECONDS}`,
    '--extractor-args', 'youtube:player_client=mweb,android',
    '-f', 'best[ext=mp4][height<=720]/bestvideo[height<=720]+bestaudio/best',
    '--merge-output-format', 'mp4',
    '-o', `${outputBasePath}_%(title).100B [%(id)s].%(ext)s`,
    cleanUrl(url),
  ];

  const start = Date.now();
  await runSpawn(YTDLP_PATH, ytdlpArgs, {
    timeoutMs: 300000,
    onLog: (chunk) => {
      const line = String(chunk).trim();
      if (line && line.includes('[download]')) logger.debug({ line }, 'yt-dlp progress');
    },
  });

  const baseName = path.basename(outputBasePath);
  const candidates = fs
    .readdirSync(TEMP_DIR)
    .filter((f) => f.startsWith(`${baseName}_`) && f.endsWith('.mp4'));

  if (candidates.length === 0) {
    throw new Error('File hasil download tidak ditemukan.');
  }

  const filePath = path.join(TEMP_DIR, candidates[candidates.length - 1]);
  const title = path
    .basename(filePath)
    .slice(baseName.length + 1)
    .replace(/ \[[^\]]+\]\.mp4$/, '');

  logger.info(
    { seconds: ((Date.now() - start) / 1000).toFixed(1), filePath },
    'Download selesai'
  );
  return { filePath, title };
}

async function sendMediaWithRetry(sock, chatId, content, msg) {
  const sendOptions = {
    quoted: msg,
    mediaUploadTimeoutMs: 120000,
  };

  let lastErr;
  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      await sock.sendMessage(chatId, content, sendOptions);
      return;
    } catch (err) {
      lastErr = err;
      logger.warn({ attempt, err: err.message }, 'Kirim media gagal');
      if (attempt < MAX_SEND_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr;
}

async function sendVideoMedia(sock, chatId, fileBuffer, title, fileName, msg) {
  const fileSizeMB = fileBuffer.length / (1024 * 1024);
  const caption = `*${title}*\nUkuran: ${fileSizeMB.toFixed(1)} MB`;

  if (fileSizeMB > WHATSAPP_ABSOLUTE_LIMIT_MB) {
    await uploadMediaToDrive(fileBuffer, fileName, 'video/mp4');
    await sock.sendMessage(
      chatId,
      {
        text: 'Ukuran video terlalu besar (>100MB) untuk dikirim ke WhatsApp, tetapi file sudah dicadangkan ke Google Drive.',
      },
      { quoted: msg }
    );
    return { status: 'skipped' };
  }

  if (fileSizeMB > WHATSAPP_DOC_LIMIT_MB) {
    await sendMediaWithRetry(
      sock,
      chatId,
      {
        document: fileBuffer,
        fileName,
        mimetype: 'video/mp4',
        caption: `${caption}\n\n*(Dikirim sebagai dokumen karena ukuran file > 45MB)*`,
      },
      msg
    );
    return { status: 'sent' };
  }

  try {
    await sendMediaWithRetry(sock, chatId, {
      video: fileBuffer,
      mimetype: 'video/mp4',
      caption,
    }, msg);
  } catch (uploadErr) {
    logger.warn({ err: uploadErr.message }, 'Gagal kirim sebagai video, fallback ke dokumen');
    await sendMediaWithRetry(
      sock,
      chatId,
      {
        document: fileBuffer,
        fileName,
        mimetype: 'video/mp4',
        caption: `${caption}\n\n*(Dikirim sebagai file dokumen)*`,
      },
      msg
    );
  }

  return { status: 'sent' };
}

async function uploadMediaToDrive(fileBuffer, fileName, mimeType) {
  const videoFolderId = normalizeFolderId(config.GDRIVE_FOLDER_VIDEOS) || normalizeFolderId(config.GOOGLE_DRIVE_FOLDER_ID);
  try {
    const fileData = await uploadToDrive(fileBuffer, fileName, mimeType, videoFolderId);
    if (fileData) {
      logger.info({ name: fileName, id: fileData.id }, 'Media disimpan ke Google Drive');
    }
  } catch (err) {
    logger.error({ err, fileName }, 'Gagal upload media ke Google Drive');
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

function buildFriendlyError(err) {
  const combined = `${err?.message || ''}\n${err?.stderr || ''}`;

  if (/duration.*(filter|matches)|filter.*duration|no video matches|did not match/i.test(combined)) {
    return '⚠️ Durasi video melebihi batas maksimal (10 menit).';
  }
  if (/private|unavailable|not.?available|not found|removed|missing/i.test(combined)) {
    return 'Video tidak ditemukan atau bersifat privat. Periksa kembali link-nya.';
  }
  if (/age.?restricted|18\+|nswf/i.test(combined)) {
    return 'Video memiliki batasan usia sehingga tidak bisa diunduh.';
  }
  if (/sign in|login|log in|authenticat/i.test(combined)) {
    return 'Video membutuhkan login sehingga tidak bisa diunduh.';
  }
  if (/403|forbidden/i.test(combined)) {
    return 'Akses ditolak (403). Coba perbarui yt-dlp: pip install -U yt-dlp';
  }
  if (/network|timed? ?out|unreachable|socket/i.test(combined)) {
    return 'Jaringan bermasalah. Periksa kembali koneksi internet kamu.';
  }
  if (/not a valid url|unsupported url/i.test(combined)) {
    return 'Link tidak valid atau tidak didukung.';
  }
  return null;
}

async function downloadTikTok(url) {
  const { data } = await axios.get('https://tikwm.com/api/', {
    params: { url, hd: 1 },
    timeout: 30000,
    headers: { 'User-Agent': USER_AGENT },
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

async function downloadDirectVideo(url, outputPath) {
  const videoResp = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    headers: { 'User-Agent': USER_AGENT },
  });

  const writer = fs.createWriteStream(outputPath);
  videoResp.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function runYtdlpFlow(sock, chatId, url, msg) {
  const { date, time } = getWIBTimestamp();
  const platform = getPlatformLabel(url);
  const fileName = `${platform}_${date}_${time}.mp4`;
  const outputBasePath = path.join(TEMP_DIR, `${Date.now()}`);

  await sock.sendMessage(
    chatId,
    { text: 'Mengunduh video. Harap tunggu...' },
    { quoted: msg }
  );

  let filePath = null;
  try {
    const result = await downloadWithYtdlp(url, outputBasePath);
    filePath = result.filePath;
    const title = result.title || 'Video';

    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      throw new Error('File hasil download kosong atau tidak ditemukan.');
    }

    const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
    if (fileSizeMB > WHATSAPP_ABSOLUTE_LIMIT_MB) {
      const fileBuffer = fs.readFileSync(filePath);
      await uploadMediaToDrive(fileBuffer, fileName, 'video/mp4');
      await sock.sendMessage(
        chatId,
        {
          text: 'Ukuran video terlalu besar (>100MB) untuk dikirim ke WhatsApp, tetapi file sudah dicadangkan ke Google Drive.',
        },
        { quoted: msg }
      );
      return { status: 'skipped' };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const sendResult = await sendVideoMedia(sock, chatId, fileBuffer, title, fileName, msg);

    if (sendResult?.status !== 'skipped') {
      await uploadMediaToDrive(fileBuffer, fileName, 'video/mp4');
    }

    logger.info({ jid: chatId, fileName }, 'Media terkirim ke WhatsApp');
    return { status: 'sent' };
  } catch (err) {
    const friendly = buildFriendlyError(err);
    if (friendly) {
      await sock.sendMessage(chatId, { text: friendly }, { quoted: msg });
      return { status: 'skipped' };
    }
    throw err;
  } finally {
    if (filePath) cleanupFile(filePath);
  }
}

async function runTikTokApiFlow(sock, chatId, url, msg) {
  const tikInfo = await downloadTikTok(url);
  const { date, time } = getWIBTimestamp();
  const fileName = `TikTok_${date}_${time}.mp4`;
  const outputPath = path.join(TEMP_DIR, `${Date.now()}.mp4`);

  try {
    if (Number(tikInfo.duration) > MAX_DURATION_SECONDS) {
      await sock.sendMessage(
        chatId,
        { text: '⚠️ Durasi video terlalu panjang. Maksimal durasi adalah 10 menit.' },
        { quoted: msg }
      );
      return { status: 'skipped' };
    }

    await sock.sendMessage(
      chatId,
      { text: `Mengunduh: *${tikInfo.title}*\nCreator: ${tikInfo.uploader}\nHarap tunggu...` },
      { quoted: msg }
    );

    await downloadDirectVideo(tikInfo.videoUrl, outputPath);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('File hasil download kosong atau tidak ditemukan.');
    }

    const fileBuffer = fs.readFileSync(outputPath);
    const sendResult = await sendVideoMedia(sock, chatId, fileBuffer, tikInfo.title, fileName, msg);
    if (sendResult?.status !== 'skipped') {
      await uploadMediaToDrive(fileBuffer, fileName, 'video/mp4');
    }
    return { status: 'sent' };
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

  const url = cleanUrl(args);

  if (!isSupportedUrl(url)) {
    await sock.sendMessage(chatId, {
      text: 'Link tidak didukung. Gunakan link dari YouTube, TikTok, Instagram, atau Facebook.',
    });
    return;
  }

  await sock.sendMessage(chatId, { react: { text: '⏳', key: msg.key } });

  if (isTikTokUrl(url)) {
    try {
      const result = await runTikTokApiFlow(sock, chatId, url, msg);
      if (result?.status === 'sent' || result?.status === 'skipped') return;
    } catch (tikErr) {
      logger.warn({ err: tikErr.message }, 'TikTok API gagal, fallback ke yt-dlp');
    }

    try {
      const result = await runYtdlpFlow(sock, chatId, url, msg);
      if (result?.status === 'sent' || result?.status === 'skipped') return;
    } catch (ytErr) {
      logger.error({ err: ytErr.message }, 'yt-dlp TikTok gagal');
    }

    await sock.sendMessage(chatId, {
      text: 'Gagal mengunduh TikTok. Coba lagi nanti ya.',
    });
    return;
  }

  try {
    await runYtdlpFlow(sock, chatId, url, msg);
  } catch (err) {
    logger.error({ err: err.message }, 'Gagal mengunduh media');
    const friendly = buildFriendlyError(err);
    await sock.sendMessage(chatId, {
      text: friendly
        ? `Gagal mengunduh media.\n${friendly}`
        : 'Gagal mengunduh media. Coba lagi nanti ya.',
    });
  }
}
