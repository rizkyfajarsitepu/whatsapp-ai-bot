import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/settings.js';
import logger from '../utils/logger.js';

let genAI = null;
let db = null;

function getSystemInstruction() {
  const currentTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  return `Kamu adalah asisten WhatsApp yang ramah dan membantu. Waktu saat ini adalah ${currentTime}. Selalu jawab dalam Bahasa Indonesia. Jangan gunakan Bahasa Inggris kecuali diminta secara spesifik oleh pengguna. Jawaban harus singkat, jelas, dan mudah dipahami.`;
}

export function initGemini() {
  genAI = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

  db = new Database(config.DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_id ON chat_history(chat_id)
  `);

  logger.info('✅ Gemini & Database initialized');
}

function getHistory(chatId) {
  const rows = db
    .prepare(
      `SELECT role, message FROM chat_history
       WHERE chat_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`
    )
    .all(chatId, config.MAX_HISTORY * 2);

  return rows.reverse().map((r) => ({
    role: r.role,
    parts: [{ text: r.message }],
  }));
}

function saveMessage(chatId, role, message) {
  db.prepare(
    `INSERT INTO chat_history (chat_id, role, message, timestamp)
     VALUES (?, ?, ?, ?)`
  ).run(chatId, role, message, Date.now());

  const count = db
    .prepare(`SELECT COUNT(*) as cnt FROM chat_history WHERE chat_id = ?`)
    .get(chatId).cnt;

  if (count > config.MAX_HISTORY * 2) {
    db.prepare(
      `DELETE FROM chat_history
       WHERE chat_id = ?
       AND id NOT IN (
         SELECT id FROM chat_history
         WHERE chat_id = ?
         ORDER BY timestamp DESC
         LIMIT ?
       )`
    ).run(chatId, chatId, config.MAX_HISTORY * 2);
  }
}

export async function chatWithHistory(chatId, userMessage) {
  if (!genAI) throw new Error('Gemini belum diinisialisasi. Panggil initGemini()');

  saveMessage(chatId, 'user', userMessage);
  const history = getHistory(chatId);

  const response = await genAI.models.generateContent({
    model: config.GEMINI_MODEL,
    contents: history,
    config: {
      systemInstruction: getSystemInstruction(),
    },
  });

  const reply = response.text || 'Maaf, saya tidak bisa membalas saat ini.';

  saveMessage(chatId, 'model', reply);
  return reply;
}

export async function chatWithCustomSystem(chatId, userMessage, systemInstruction) {
  if (!genAI) throw new Error('Gemini belum diinisialisasi. Panggil initGemini()');

  const response = await genAI.models.generateContent({
    model: config.GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      systemInstruction,
    },
  });

  return response.text || 'Maaf, saya tidak bisa membalas saat ini.';
}

export function getChatSummary() {
  if (!db) return [];
  return db
    .prepare(
      `SELECT c.chat_id, c.total, c.last_timestamp, h.message AS last_message, h.role AS last_role
       FROM (
         SELECT chat_id, COUNT(*) AS total, MAX(id) AS last_id, MAX(timestamp) AS last_timestamp
         FROM chat_history
         GROUP BY chat_id
       ) c
       LEFT JOIN chat_history h ON h.id = c.last_id
       ORDER BY c.last_id DESC`
    )
    .all();
}

export function getChatHistory(chatId) {
  if (!db) return [];
  return db
    .prepare(
      `SELECT id, chat_id, role, message, timestamp
       FROM chat_history
       WHERE chat_id = ?
       ORDER BY timestamp ASC`
    )
    .all(chatId);
}

export function deleteChatHistory(chatId) {
  if (!db) return 0;
  return db.prepare('DELETE FROM chat_history WHERE chat_id = ?').run(chatId).changes;
}

export function getDbStats() {
  const stats = {
    path: path.resolve(config.DB_PATH),
    sizeBytes: 0,
    totalMessages: 0,
    totalChats: 0,
  };

  try {
    if (fs.existsSync(stats.path)) {
      stats.sizeBytes = fs.statSync(stats.path).size;
    }
  } catch (err) {
    logger.warn({ err }, 'Gagal membaca statistik file database');
  }

  if (db) {
    stats.totalMessages = db.prepare('SELECT COUNT(*) AS c FROM chat_history').get().c;
    stats.totalChats = db.prepare('SELECT COUNT(DISTINCT chat_id) AS c FROM chat_history').get().c;
  }

  return stats;
}
