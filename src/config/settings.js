import 'dotenv/config';

export const config = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  REMOVE_BG_API_KEY: process.env.REMOVE_BG_API_KEY,
  OWNER_NUMBER: process.env.OWNER_NUMBER,
  BOT_NAME: process.env.BOT_NAME || 'WhatsApp AI Bot',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  MAX_HISTORY: 10,
  DB_PATH: './chat_history.db',
};
