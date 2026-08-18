# Panduan Install Bot WhatsApp di Termux (HP Android) — Jalan 24 Jam

Panduan ini untuk menjalankan **whatsapp-ai-bot** langsung di HP Android lewat
Termux, tanpa VPS, dan dijaga tetap hidup 24 jam dengan `pm2`.

> **Catatan penting:** Bot ini memakai beberapa *native module* yang tidak punya
> binary siap-pakai untuk Android, jadi wajib dikompilasi dari source
> (`sharp`, `canvas`, `better-sqlite3`). Langkah-langkah di bawah sudah
> dirancang agar kompilasi berhasil di Termux.

---

## Bagian 0 — Persiapan Termux

1. **JANGAN** install Termux dari Google Play Store (versinya basi & repo-nya rusak).
   Install dari sumber resmi:
   - **F-Droid:** https://f-droid.org/packages/com.termux
   - **GitHub:** https://github.com/termux/termux-app/releases

2. Buka Termux, beri izin akses penyimpanan (opsional):

```bash
termux-setup-storage
```

3. Update paket:

```bash
pkg update && pkg upgrade -y
```

---

## Bagian 1 — Install Toolchain & Library Sistem

Paket ini dibutuhkan untuk **mengompilasi** `sharp`, `canvas`, dan
`better-sqlite3`, plus binary eksternal `ffmpeg` & `yt-dlp`.

```bash
pkg install -y nodejs-lts git python make clang pkg-config x11-repo
pkg install -y build-essential libpixman libcairo pango libjpeg-turbo giflib librsvg xorgproto libvips ffmpeg yt-dlp
```

Verifikasi:

```bash
node -v                    # harus Node v20+ (biasanya v22 LTS)
pkg-config --modversion vips-cpp   # harus muncul versi, misal 8.18.x
ffmpeg -version | head -1
yt-dlp --version
```

> Jika `pkg-config --modversion vips-cpp` error karena `xproto`/`xrender` tidak
> ketemu, jalankan `pkg install xorgproto` lalu ulangi.

---

## Bagian 2 — Clone & Setup Konfigurasi

```bash
cd ~
git clone https://github.com/rizkyfajarsitepu/whatsapp-ai-bot.git
cd whatsapp-ai-bot
```

Buat file `.env` dan isi:

```bash
cp .env.example .env
nano .env
```

Isi minimal:

```env
GEMINI_API_KEY=your_gemini_api_key_here
OWNER_NUMBER=628xxxxxxxxxx
BOT_NAME=MyBot
```

- `GEMINI_API_KEY` → **wajib**. Ambil di https://aistudio.google.com/apikey
- `REMOVE_BG_API_KEY` → opsional, hanya untuk fitur `!hapusbg`
- `OWNER_NUMBER` → nomor owner (format internasional tanpa `+`)
- `BOT_NAME` → nama bot

> Repo ini sudah dirapikan agar `npm install` aman di Android
> (`@ffmpeg-installer/ffmpeg` yang tidak terpakai & tidak mendukung Android
> sudah dihapus dari `package.json`).

---

## Bagian 3 — Install npm (Kompilasi Native, 2 Tahap)

Pakai cara dua tahap agar `npm install` tidak gagal di tengah jalan.

```bash
# Tahap 1: install semua dependensi TANPA menjalankan script build (anti-gagal)
npm install --ignore-scripts

# Tahap 2: tempel dependensi build untuk kompilasi
npm install --no-save --package-lock=false node-addon-api node-gyp
```

Kompilasi native module satu per satu:

```bash
# sharp → pakai libvips milik Termux (bukan download prebuilt yang gagal di Android)
SHARP_FORCE_GLOBAL_LIBVIPS=1 npm rebuild sharp

# canvas → otomatis fallback ke node-gyp build
npm rebuild canvas

# better-sqlite3 → otomatis fallback ke node-gyp build
npm rebuild better-sqlite3
```

> Proses kompilasi makan waktu beberapa menit dan memakan semua core CPU.
> Biarkan HP tetap nyala & dicharge selama build.

Verifikasi semua native module benar-benar jalan:

```bash
node -e "const s=require('sharp');console.log('sharp',s.versions.sharp,'| vips',s.versions.vips)"
node -e "const c=require('canvas');console.log('canvas OK', !!c.createCanvas(1,1))"
node -e "const D=require('better-sqlite3');const db=new D(':memory:');db.exec('create table t(a)');console.log('sqlite OK')"
node -e "import('fluent-ffmpeg').then(()=>console.log('fluent-ffmpeg OK'))"
```

Semua harus mencetak `OK` / versi tanpa error.

> **Jika build error:**
> - `node-addon-api` / `node-gyp` not found → jalankan lagi Tahap 2 lalu rebuild.
> - OOM saat build → `export NODE_OPTIONS=--max-old-space-size=4096`
> - `/tmp` read-only → `mkdir -p $HOME/tmp && export TMPDIR=$HOME/tmp`
> - `xproto` error → `pkg install xorgproto`
> - sharp masih gagal pakai NDK cross-compiler → coba
>   `GYP_DEFINES="android_ndk_path=" SHARP_FORCE_GLOBAL_LIBVIPS=1 npm rebuild sharp`

---

## Bagian 4 — Scan QR & Konek WhatsApp

```bash
npm start
```

- QR code akan muncul sebagai teks ASCII di terminal.
- Buka WhatsApp → **Perangkat Tertaut** → **Tautkan Perangkat** → scan.
- Session tersimpan permanen di folder `auth_info/`, jadi **tidak perlu scan
  ulang** setelah ini (kecuali logout/logged out).

Jika bot sudah konek (muncul log "Bot berhasil terhubung ke WhatsApp!"),
hentikan sementara untuk lanjut ke mode pm2:

```
Ctrl+C
```

---

## Bagian 5 — Mode 24 Jam dengan pm2

### 1. Install & aktifkan wake-lock (cegah CPU tidur saat layar mati)

```bash
pkg install -y termux-api
npm i -g pm2
termux-wake-lock
```

> `termux-wake-lock` butuh app **Termux:API** (dari F-Droid) dan dijalankan
> ulang setiap kali Termux dibuka. Tambahkan `termux-wake-lock` di awal
> `.bashrc` (`nano ~/.bashrc`) agar otomatis.

### 2. Jalankan bot lewat pm2

```bash
cd ~/whatsapp-ai-bot
npm run pm2:start      # pm2 start ecosystem.config.cjs
pm2 save               # simpan daftar proses utk auto-restore
```

> **Anti IPv6 unreachable:** bot sudah dipaksa pakai rute IPv4 (`ipv4first`)
> via `NODE_OPTIONS` di `ecosystem.config.cjs` dan `dns.setDefaultResultOrder`
> di `src/index.js`. Jika menjalankan bot **tanpa pm2**, tambahkan variabel
> berikut agar hasil sama:
>
> ```bash
> NODE_OPTIONS="--dns-result-order=ipv4first" node src/index.js
> ```

Cek status & log:

```bash
pm2 status
pm2 logs whatsapp-ai-bot
```

pm2 akan otomatis **restart** bot kalau crash/koneksi putus.

### 3. Pengaturan HP agar bot tetap hidup

- **Matikan optimasi baterai untuk Termux:**
  Pengaturan Android → Aplikasi → Termux → Baterai → **Tanpa batasan / Jangan optimalkan**.
- **Colokkan charger** (bot jalan terus tanpa henti).
- Layar boleh mati; `termux-wake-lock` menjaga CPU tetap hidup.
- **Jangan** geser-close aplikasi Termux dari recent apps (lockscreen app).
  Aktifkan "Keep screen on" / lock di recents agar tidak di-kill Android.

### 4. Setelah HP restart / reboot

1. Buka Termux.
2. Jalankan `termux-wake-lock`.
3. Restore bot: `pm2 resurrect` (atau `pm2 start whatsapp-ai-bot`).
4. Cek `pm2 status` — harus `online`.

---

## Bagian 6 — Verifikasi & Fitur

- **Dashboard lokal:** buka browser di HP → `http://localhost:3000`
  (login: `superadmin` / `rahasia123`). Dari dashboard kamu bisa kelola grup,
  buat voucher, verifikasi grup, suntik XP RPG, dst.
  > Dashboard hanya bisa diakses dari HP itu sendiri (localhost). Untuk akses
  > dari luar, butuh port-forward (mis. Tailscale/Cloudflared) — di luar scope panduan ini.
- **Verifikasi grup:** grup baru statusnya "belum terverifikasi" → aktifkan lewat
  dashboard (`/api/groups/toggle` di dashboard) agar bot merespons di grup.
- **Fitur penting yang butuh dependensi eksternal:**
  - `!tts` → butuh `ffmpeg` (sudah diinstall).
  - `!dl` → butuh `yt-dlp` (sudah diinstall).
  - `!hapusbg` → butuh `REMOVE_BG_API_KEY`.
  - `!stiker`, welcome banner, chat AI → sudah siap tanpa setup tambahan.

---

## Bagian 7 — Google Drive (Upload Media & Auto-Backup Database)

Bot bisa otomatis menyimpan media hasil `!dl` ke Google Drive dan mem-backup
database `chat_history.db` setiap 24 jam.

> **Penting:** Google Drive memakai **OAuth2** (akun Google pribadi).
> **Service Account TIDAK bisa** dipakai untuk upload ke Drive pribadi karena
> tidak punya storage quota (error `403 Service Accounts do not have storage quota`).

### 1. Buat OAuth client di Google Cloud Console

1. Buka https://console.cloud.google.com → buat project baru (mis. `whatsapp-bot-oauth`)
   atau pakai project yang sudah kamu akses.
2. **APIs & Services → Library** → cari **Google Drive API** → **Enable**.
3. **OAuth consent screen** → **External** → isi nama app + email → **Save**.
   Di **Audience**, tambahkan **email Google kamu** sebagai **Test user**.
4. **Credentials → Create Credentials → OAuth client ID** → Application type:
   **Desktop app** → **Create**. Salin **Client ID** dan **Client Secret**.

> Jika tab External tidak muncul, brand sudah pernah dibuat — langsung ke bagian
> **Audience** untuk menambah test user. Jika error "You need additional access",
> kamu tidak punya akses ke project itu → buat project baru.

### 2. Generate refresh token (sekali saja)

Di folder project (`~/whatsapp-ai-bot`), dengan client ID/secret sudah terisi di `.env`:

```bash
node scripts/generateDriveToken.js
```

1. Buka URL yang dicetak di browser (login akun Google) → **Allow**.
2. Browser diarahkan ke `http://localhost/?code=...` (halaman error itu normal).
3. Salin kode setelah `code=`, tempel di terminal → script mencetak
   `GOOGLE_DRIVE_REFRESH_TOKEN=...`.

### 3. Konfigurasi di `.env`

```bash
nano ~/whatsapp-ai-bot/.env
```

```env
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_TYPE=oauth2
GOOGLE_DRIVE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=GOCSPX-xxxx
GOOGLE_DRIVE_REFRESH_TOKEN=1//0xxxx
GOOGLE_DRIVE_REDIRECT_URI=http://localhost
GOOGLE_DRIVE_FOLDER_ID=1c9zMtaT9sKVAYv3e9vICG5ChMNLWBX8t
GOOGLE_DRIVE_BACKUP_ENABLED=true
GOOGLE_DRIVE_BACKUP_FOLDER_ID=isi_id_folder_backup_kamu
GOOGLE_DRIVE_BACKUP_CRON=0 0 * * *
GOOGLE_DRIVE_BACKUP_ON_START=true
```

Cara mendapat `GOOGLE_DRIVE_FOLDER_ID`: buka folder di browser
(`drive.google.com`) → ID-nya adalah string panjang di URL setelah
`/drive/folders/`.

> Nilai `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN`, dan `FOLDER_ID` sama seperti
> yang dipakai di PC — cukup salin. Nilai yang sama bekerja di semua perangkat.

### 4. Install dependency & restart

`googleapis` dan `node-cron` murni JavaScript (tidak perlu dikompilasi):

```bash
cd ~/whatsapp-ai-bot
git pull
npm install --ignore-scripts
npm install --no-save --package-lock=false node-addon-api node-gyp
npm rebuild better-sqlite3
npm run pm2:restart
```

Cek log:


```bash
pm2 logs whatsapp-ai-bot
```

Harus muncul:

```
✅ Google Drive API berhasil diinisialisasi
✅ Scheduler backup database aktif
```

---

## Catatan Keamanan & Operasional

- **Pakai nomor WhatsApp cadangan**, bukan nomor utama. WhatsApp resmi bisa
  menandai akun yang memakai client tidak resmi (unofficial) seperti Baileys.
- **Jangan pernah commit folder `auth_info/`** ke Git — berisi kredensial
  session WhatsApp. Folder ini sudah ada di `.gitignore`.
- Backup folder `auth_info/` sesekali; kalau hilang, harus scan QR ulang.
- Baterai yang dicharge terus-menerus bisa memuai → gunakan HP bekas / charger
  cerdas dan (jika didukung) batasi pengisian di ~80%.
- Update bot: `git pull` lalu `npm install` ulang bagian yang berubah.