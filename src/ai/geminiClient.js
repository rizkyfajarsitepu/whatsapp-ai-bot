import Database from 'better-sqlite3';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/settings.js';

let genAI = null;
let db = null;

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

  console.log('✅ Gemini & Database initialized');
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
  });

  const reply = response.text || 'Maaf, saya tidak bisa membalas saat ini.';

  saveMessage(chatId, 'model', reply);
  return reply;
}
