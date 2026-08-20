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
  const isYouTube = /youtu\.?be/i.test(url);
  const isInstagram = /instagram\.com/i.test(url);
  const isTikTok = /tiktok\.com/i.test(url);

  const args = [
    '--force-ipv4',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '60',
    '--retries', '5',
    '--match-filter', `duration <= ${MAX_DURATION_SECONDS}`,
    '--merge-output-format', 'mp4',
  ];

  if (isYouTube) {
    args.push(
      '--extractor-args', 'youtube:player_client=mweb,android',
      '-f', 'best[ext=mp4][height<=720]/bestvideo[height<=720]+bestaudio/best'
    );
  } else if (isInstagram) {
    args.push(
      '--user-agent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
      '-f', 'best/bestvideo+bestaudio'
    );
  } else if (isTikTok) {
    args.push(
      '--user-agent', USER_AGENT,
      '-f', 'best/bestvideo+bestaudio'
    );
  } else {
    args.push('-f', 'best[ext=mp4]/best');
  }

  args.push('-o', `${outputBasePath}_%(title).100B [%(id)s].%(ext)s`, cleanUrl(url));

  const start = Date.now();
  await runSpawn(YTDLP_PATH, args, {
    timeoutMs: 300000,
    onLog: (chunk) => {
      const line = String(chunk).trim();
      if (line && line.includes('[download]')) logger.debug({ line }, 'yt-dlp progress');
    },
  });

  const baseName = path.basename(outputBasePath);
  let found = null;
  for (const f of fs.readdirSync(TEMP_DIR)) {
    if (!f.startsWith(`${baseName}_`) || f.endsWith('.part') || /\.f\d+\./.test(f)) continue;
    const full = path.join(TEMP_DIR, f);
    const size = fs.statSync(full).size;
    if (size > 0 && (!found || size > found.size)) {
      found = { filePath: full, size };
    }
  }

  if (!found) {
    throw new Error('File hasil download tidak ditemukan.');
  }

  const filePath = found.filePath;
  const title = path
    .basename(filePath)
    .slice(baseName.length + 1)
    .replace(/ \[[^\]]+\]\.[^.]+$/, '');

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

async function downloadTikTokMeta(url) {
  const { data } = await axios.get('https://tikwm.com/api/', {
    params: { url, hd: 1 },
    timeout: 30000,
    headers: { 'User-Agent': USER_AGENT },
  });

  if (data?.code !== 0) {
    throw new Error(data?.msg || 'Gagal mendapatkan metadata TikTok');
  }

  return {
    title: data.data?.title || 'TikTok Video',
    uploader: data.data?.author?.nickname || data.data?.author?.unique_id || 'TikTok',
    duration: data.data?.duration,
  };
}

function pickInstagramVideo(medias) {
  if (!Array.isArray(medias)) return null;
  const hit = medias.find(
    (m) => m && m.url && /video/i.test(String(m.type || m.extension || ''))
  );
  return hit ? hit.url : null;
}

function parseInstagramApiResult(data) {
  if (!data) return null;
  const videoUrl = pickInstagramVideo(data?.medias || data?.media);
  if (!videoUrl) return null;
  return { videoUrl, title: data?.title || 'Instagram Video' };
}

function parseSnapInstaResult(data) {
  if (!data || data?.status !== 'ok') return null;
  const inner = data?.data || data;
  const videoUrl = inner?.video || pickInstagramVideo(inner?.media);
  if (!videoUrl) return null;
  return { videoUrl, title: inner?.title || 'Instagram Video' };
}

async function scrapeInstagramDirect(url) {
  const errors = [];

  try {
    const { data } = await axios.post(
      'https://instasupersave.com/api/ig',
      new URLSearchParams({ url }),
      {
        timeout: 30000,
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    const result = parseInstagramApiResult(data);
    if (result) return result;
    errors.push('instasupersave: respons tanpa video');
  } catch (err) {
    errors.push(`instasupersave: ${err.message}`);
  }

  try {
    const { data } = await axios.post(
      'https://snapinsta.app/api/ajaxSearch?lang=id',
      new URLSearchParams({ data: url }),
      {
        timeout: 30000,
        headers: {
          'User-Agent': USER_AGENT,
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    const result = parseSnapInstaResult(data);
    if (result) return result;
    errors.push('snapinsta: respons tanpa video');
  } catch (err) {
    errors.push(`snapinsta: ${err.message}`);
  }

  throw new Error(`Semua scraper Instagram gagal: ${errors.join('; ')}`);
}

async function downloadDirectStream(url, outputPath) {
  const videoResp = await axios.get(url, {
    responseType: 'stream',
    timeout: 120000,
    maxRedirects: 5,
    headers: { 'User-Agent': USER_AGENT, Referer: 'https://www.instagram.com/' },
  });

  const writer = fs.createWriteStream(outputPath);
  videoResp.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
    videoResp.data.on('error', reject);
  });
}

async function tryDownloadInstagram(url, outputBasePath) {
  try {
    const direct = await scrapeInstagramDirect(url);
    const outputPath = path.join(TEMP_DIR, `${path.basename(outputBasePath)}_ig.mp4`);
    await downloadDirectStream(direct.videoUrl, outputPath);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('File hasil unduhan Instagram kosong.');
    }

    logger.info({ outputPath }, 'Instagram direct download selesai');
    return { filePath: outputPath, title: direct.title || 'Instagram Video' };
  } catch (err) {
    logger.warn({ err: err.message }, 'Scraper Instagram gagal, fallback ke yt-dlp');
    return null;
  }
}

async function runYtdlpFlow(sock, chatId, url, msg) {
  const { date, time } = getWIBTimestamp();
  const platform = getPlatformLabel(url);
  const fileName = `${platform}_${date}_${time}.mp4`;
  const outputBasePath = path.join(TEMP_DIR, `${Date.now()}`);

  let statusText = 'Mengunduh video. Harap tunggu...';
  if (isTikTokUrl(url)) {
    try {
      const tikInfo = await downloadTikTokMeta(url);
      statusText = `Mengunduh: *${tikInfo.title}*\nCreator: ${tikInfo.uploader}\nHarap tunggu...`;
    } catch {}
  }

  await sock.sendMessage(
    chatId,
    { text: statusText },
    { quoted: msg }
  );

  let filePath = null;
  try {
    let title = 'Video';

    if (isInstagramUrl(url)) {
      const insta = await tryDownloadInstagram(url, outputBasePath);
      if (insta) {
        filePath = insta.filePath;
        title = insta.title;
      }
    }

    if (!filePath) {
      const result = await downloadWithYtdlp(url, outputBasePath);
      filePath = result.filePath;
      title = result.title || 'Video';
    }

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
