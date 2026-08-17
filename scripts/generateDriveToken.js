import 'dotenv/config';
import readline from 'readline';
import { config } from '../src/config/settings.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (q) => new Promise((resolve) => rl.question(q, resolve));

const REDIRECT_URI = config.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost';

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: config.GOOGLE_DRIVE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal tukar kode: ${res.status} ${errText}`);
  }

  return res.json();
}

async function main() {
  if (!config.GOOGLE_DRIVE_CLIENT_ID || !config.GOOGLE_DRIVE_CLIENT_SECRET) {
    console.error('Isi dulu GOOGLE_DRIVE_CLIENT_ID dan GOOGLE_DRIVE_CLIENT_SECRET di .env');
    process.exit(1);
  }

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(config.GOOGLE_DRIVE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive')}` +
    `&access_type=offline&prompt=consent`;

  console.log('\n1. Buka URL berikut di browser (login dengan akun Google milik bot):\n');
  console.log(authUrl);
  console.log('\n2. Setelah authorize, browser akan diarahkan ke localhost. Salin nilai `code=` dari URL baris tersebut.\n');

  const code = (await prompt('Tempel kode (yang setelah code=): ')).trim();
  rl.close();

  const tokens = await exchangeCode(code);

  if (!tokens.refresh_token) {
    console.error('\nTidak dapat refresh_token. Pastikan URL dibuka dengan mode penyamaran / consent ulang (prompt=consent).');
    process.exit(1);
  }

  console.log('\n✅ Berhasil! Tambahkan ke .env:\n');
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('\nLalu atur GOOGLE_DRIVE_TYPE=oauth2 dan restart bot.\n');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});