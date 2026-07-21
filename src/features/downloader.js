import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';
import axios from 'axios';

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
    timeout: 20000,
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

async function downloadWithYtdlp(url, outputPath) {
  const isTikTok = isTikTokUrl(url);

  const args = [
    '--no-warnings',
    '--no-playlist',
    '--concurrent-fragments', '4',
    '--remux-video', 'mp4',
    '-f', 'best[ext=mp4]',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ];

  if (isTikTok) {
    args.push(
      '--extractor-args', 'tiktok:platform=app',
      '--force-ipv4',
    );
  }

  args.push('-o', outputPath, url);

  const { stdout, stderr } = await execFileAsync(YTDLP_PATH, args, {
    timeout: 120000,
    maxBuffer: 50 * 1024 * 1024,
  });

  return { stdout, stderr };
}

async function getInfoWithYtdlp(url) {
  const isTikTok = isTikTokUrl(url);

  const args = [
    '--no-warnings',
    '--no-playlist',
    '--dump-json',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ];

  if (isTikTok) {
    args.push(
      '--extractor-args', 'tiktok:platform=app',
      '--force-ipv4',
    );
  }

  args.push(url);

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

  if (isTikTokUrl(url)) {
    try {
      const tikInfo = await downloadTikTok(url);
      await sock.sendMessage(chatId, {
        text: `Mengunduh: *${tikInfo.title}*\nCreator: ${tikInfo.uploader}\nHarap tunggu...`,
      });

      const timestamp = Date.now();
      const outputPath = path.join(TEMP_DIR, `${timestamp}.mp4`);

      const videoResp = await axios.get(tikInfo.videoUrl, {
        responseType: 'stream',
        timeout: 60000,
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
        cleanupFile(outputPath);
        await sock.sendMessage(chatId, {
          text: `Ukuran file terlalu besar (${fileSizeMB.toFixed(1)} MB). Batas maksimal 100 MB.`,
        });
        return;
      }

      const fileBuffer = fs.readFileSync(outputPath);
      await sock.sendMessage(chatId, {
        video: fileBuffer,
        mimetype: 'video/mp4',
        caption: `*${tikInfo.title}*\nUkuran: ${fileSizeMB.toFixed(1)} MB`,
      });

      cleanupFile(outputPath);
      return;
    } catch (tikErr) {
      console.error('[Downloader] TikTok API Error:', tikErr.message);
      await sock.sendMessage(chatId, {
        text: `Gagal mengunduh TikTok: ${tikErr.message}`,
      });
      return;
    }
  }

  const timestamp = Date.now();
  const outputPath = path.join(TEMP_DIR, `${timestamp}.mp4`);

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

    await downloadWithYtdlp(url, outputPath);

    if (!fs.existsSync(outputPath)) {
      throw new Error('File tidak ditemukan setelah download');
    }

    const fileStat = fs.statSync(outputPath);
    const fileSizeMB = fileStat.size / (1024 * 1024);

    if (fileSizeMB > 100) {
      cleanupFile(outputPath);
      await sock.sendMessage(chatId, {
        text: `Ukuran file terlalu besar (${fileSizeMB.toFixed(1)} MB). Batas maksimal 100 MB.`,
      });
      return;
    }

    const fileBuffer = fs.readFileSync(outputPath);
    const isAudio = info?.ext === 'mp3' || info?.acodec === 'none' || (info?.vcodec === 'none' && info?.acodec);

    if (isAudio) {
      await sock.sendMessage(chatId, {
        audio: fileBuffer,
        mimetype: 'audio/mpeg',
      });
    } else {
      await sock.sendMessage(chatId, {
        video: fileBuffer,
        mimetype: 'video/mp4',
        caption: `*${title}*\nUkuran: ${fileSizeMB.toFixed(1)} MB`,
      });
    }

    console.log(`[Downloader] File terkirim ke ${chatId}: ${path.basename(outputPath)}`);
  } catch (err) {
    console.error('[Downloader] Error:', err);
    await sock.sendMessage(chatId, {
      text: `Gagal mengunduh media. Error: ${err.message}`,
    });
  } finally {
    cleanupFile(outputPath);
  }
}
