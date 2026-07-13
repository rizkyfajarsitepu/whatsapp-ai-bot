import axios from 'axios';

export async function handleSholat(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !sholat <kota>\nContoh: !sholat Medan',
    });
    return;
  }

  const city = args.trim();

  try {
    const response = await axios.get(
      `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Indonesia&method=2`,
      { timeout: 10000 }
    );

    const data = response.data.data;
    if (!data) {
      throw new Error('Kota tidak ditemukan');
    }

    const timings = data.timings;
    const date = data.date;

    const text = `*Jadwal Sholat - ${city}*\nTanggal: ${date.readable}\n\n` +
      `/Subuh: ${timings.Fajr}\n` +
      ` Syuruq: ${timings.Sunrise}\n` +
      ` Dzuhur: ${timings.Dhuhr}\n` +
      ` Ashar: ${timings.Asr}\n` +
      ` Maghrib: ${timings.Maghrib}\n` +
      ` Isya: ${timings.Isha}`;

    await sock.sendMessage(chatId, { text });

    console.log(`📤 [Sholat] Jadwal sholat terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[Sholat] Error:', err);
    await sock.sendMessage(chatId, {
      text: `Gagal mengambil jadwal sholat untuk kota "${city}". Pastikan nama kota benar.`,
    });
  }
}

export async function handleCuaca(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !cuaca <kota>\nContoh: !cuaca Medan',
    });
    return;
  }

  const city = args.trim();

  try {
    const response = await axios.get(
      `https://wttr.in/${encodeURIComponent(city)}?format=%l:+%C+%t+%h+%w`,
      {
        timeout: 10000,
        headers: { 'User-Agent': 'curl/7.64.1' },
      }
    );

    const weatherText = response.data.trim();

    if (weatherText.includes('Unknown location') || weatherText.includes('ERROR')) {
      throw new Error('Kota tidak ditemukan');
    }

    await sock.sendMessage(chatId, {
      text: `*Cuaca:*\n${weatherText}`,
    });

    console.log(`📤 [Cuaca] Info cuaca terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[Cuaca] Error:', err);
    await sock.sendMessage(chatId, {
      text: `Gagal mengambil data cuaca untuk "${city}". Pastikan nama kota benar.`,
    });
  }
}

export async function handleKurs(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !kurs <dari> <ke> <jumlah>\nContoh: !kurs usd idr 10\n\nMata uang: USD, EUR, IDR, JPY, GBP, dll.',
    });
    return;
  }

  const parts = args.trim().split(/\s+/);
  if (parts.length < 3) {
    await sock.sendMessage(chatId, {
      text: 'Format: !kurs <dari> <ke> <jumlah>\nContoh: !kurs usd idr 10',
    });
    return;
  }

  const from = parts[0].toUpperCase();
  const to = parts[1].toUpperCase();
  const amount = parseFloat(parts[2]);

  if (isNaN(amount) || amount <= 0) {
    await sock.sendMessage(chatId, {
      text: 'Jumlah harus berupa angka positif.',
    });
    return;
  }

  try {
    const response = await axios.get(
      `https://api.frankfurter.app/latest?from=${from}&to=${to}`,
      { timeout: 10000 }
    );

    const data = response.data;
    if (!data.rates || !data.rates[to]) {
      throw new Error('Mata uang tidak valid');
    }

    const rate = data.rates[to];
    const result = (amount * rate).toFixed(2);

    const text = `*Konversi Mata Uang*\n\n` +
      `${amount} ${from} = ${result} ${to}\n\n` +
      `Kurs: 1 ${from} = ${rate} ${to}\n` +
      `Tanggal: ${data.date}`;

    await sock.sendMessage(chatId, { text });

    console.log(`📤 [Kurs] Kurs terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[Kurs] Error:', err);
    await sock.sendMessage(chatId, {
      text: `Gagal mengambil data kurs. Pastikan kode mata uang benar (contoh: USD, IDR, EUR).`,
    });
  }
}

export async function handleCrypto(sock, msg, args) {
  const chatId = msg.key.remoteJid;

  if (!args || args.trim().length === 0) {
    await sock.sendMessage(chatId, {
      text: 'Gunakan: !crypto <nama_koin>\nContoh: !crypto bitcoin\n\nContoh lain: ethereum, solana, dogecoin',
    });
    return;
  }

  const coin = args.trim().toLowerCase();

  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd&idr&include_24hr_change=true`,
      { timeout: 10000 }
    );

    const data = response.data[coin];
    if (!data) {
      throw new Error('Koin tidak ditemukan');
    }

    const priceUSD = data.usd?.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) || 'N/A';
    const priceIDR = data.idr?.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' }) || 'N/A';
    const change24h = data.usd_24h_change;

    let changeText = 'N/A';
    if (change24h !== undefined && change24h !== null) {
      const emoji = change24h >= 0 ? '🟢' : '🔴';
      changeText = `${emoji} ${change24h.toFixed(2)}%`;
    }

    const text = `*Harga ${coin.charAt(0).toUpperCase() + coin.slice(1)}*\n\n` +
      `USD: ${priceUSD}\n` +
      `IDR: ${priceIDR}\n` +
      `24 Jam: ${changeText}`;

    await sock.sendMessage(chatId, { text });

    console.log(`📤 [Crypto] Harga koin terkirim ke ${chatId}`);
  } catch (err) {
    console.error('[Crypto] Error:', err);
    await sock.sendMessage(chatId, {
      text: `Gagal mengambil data harga "${coin}". Pastikan nama koin benar.`,
    });
  }
}
