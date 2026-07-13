# TECH STACK & SPESIFIKASI TEKNIS

## CORE BOT WA
*   **Library:** `@whiskeysockets/baileys`
*   **Login:** Menggunakan metode Scan QR Code.
*   **Koneksi:** Wajib memiliki mekanisme *auto-reconnect* jika terputus (kecuali status `loggedOut` dari WhatsApp).

## INTEGRASI AI (GEMINI)
*   **Library:** `@google/genai`
*   **Model Teks/Vision/STT:** `gemini-3.5-flash` (atau varian terbaru).
*   **TTS (Text-to-Speech):** Menggunakan library `google-tts-api` (murni, tanpa Gemini API). Bahasa default: Indonesia (`id`).
*   **Memory:** Gunakan `better-sqlite3` atau `lowdb` untuk menyimpan 5-10 histori percakapan per user agar AI memiliki konteks chat.

## PENGOLAHAN MEDIA & UTILITAS
*   **Gambar/Stiker:** Menggunakan `sharp`.
*   **Audio/Video/Stiker:** Menggunakan `ffmpeg` (via `fluent-ffmpeg`).
*   **PDF:** Menggunakan `pdf-lib`.
*   **Download Sosmed:** Menggunakan `yt-dlp` (via `child_process`).
*   **QR Code:** Menggunakan library `qrcode`.
*   **Kalkulator:** Menggunakan `mathjs` (dilarang menggunakan `eval()` bawaan JS).
*   **Info API Publik:** Menggunakan `axios` untuk Aladhan (Sholat), wttr.in (Cuaca), Frankfurter (Kurs), CoinGecko (Crypto).
*   **Rate Limiting:** Menggunakan `bottleneck` (maksimal 10 command per menit per user).
*   **Logging:** Menggunakan `pino` + `pino-pretty` (via `src/utils/logger.js`).
*   **Deployment:** Menggunakan PM2 dengan `ecosystem.config.js`.