import { createCanvas, loadImage } from 'canvas';

export const handleWelcomeEvent = (sock, featureToggles) => {
  sock.ev.on('group-participants.update', async (update) => {
    const { id, participants, action } = update;

    console.log(`\n[🚨 BAILEYS EVENT] Mendapat update dari grup: ${id}`);
    console.log(`[🚨 BAILEYS EVENT] Aksi: ${action} | Peserta Detail:`, JSON.stringify(participants, null, 2));

    if (action !== 'add') return;

    if (featureToggles && featureToggles.welcome_canvas === false) {
      console.log('[⚙️ SYSTEM] Welcome Canvas OFF, membatalkan render.');
      return;
    }

    try {
      console.log(`[⏳ PROSES] Merender banner Welcome untuk ${participants.length} member baru...`);

      const groupMetadata = await sock.groupMetadata(id);
      const groupName = groupMetadata.subject || 'Grup WhatsApp';

      for (let num of participants) {
        const jid = typeof num === 'object' && num !== null ? num.id : num;
        const targetJid = String(jid);

        let ppUrl;
        try {
          console.log(`[🔍 DEBUG] Mencoba mengunduh DP untuk: ${targetJid} ...`);
          ppUrl = await Promise.race([
            sock.profilePictureUrl(targetJid, 'image'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_DP')), 5000))
          ]);
        } catch (err) {
          console.log(`[⚠️ GAGAL DP] Gagal mengambil foto untuk ${targetJid}. Alasan: ${err.message}`);
          ppUrl = null;
        }

        if (!ppUrl) {
          console.log(`[ℹ️ INFO] Menggunakan avatar default untuk ${targetJid}.`);
          ppUrl = 'https://i.ibb.co/3Fh9V6p/avatar-contact.png';
        } else {
          console.log(`[✅ SUKSES DP] Foto profil ${targetJid} berhasil diunduh!`);
        }

        const canvas = createCanvas(800, 300);
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#0f2027');
        gradient.addColorStop(0.5, '#203a43');
        gradient.addColorStop(1, '#2c5364');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for (let i = 0; i < 100; i++) {
          ctx.beginPath();
          ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }

        const avatar = await loadImage(ppUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(150, 150, 100, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 50, 50, 200, 200);
        ctx.restore();

        ctx.beginPath();
        ctx.arc(150, 150, 100, 0, Math.PI * 2, true);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 10;
        ctx.stroke();

        ctx.font = 'bold 55px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('WELCOME!', 300, 120);

        ctx.font = '30px Arial';
        ctx.fillStyle = '#cccccc';
        const memberName = targetJid.split('@')[0];
        ctx.fillText(`@${memberName}`, 300, 170);

        ctx.font = 'bold 35px Arial';
        ctx.fillStyle = '#00ffcc';
        const shortGroupName = groupName.length > 22 ? groupName.substring(0, 22) + '...' : groupName;
        ctx.fillText(shortGroupName, 300, 230);

        const buffer = canvas.toBuffer('image/png');
        const captionMsg = `Halo @${memberName}! 👋\n\nSelamat datang di grup *${groupName}*.\nJangan lupa perkenalkan diri ya!`;

        await sock.sendMessage(id, {
          image: buffer,
          caption: captionMsg,
          mentions: [targetJid]
        });
        console.log(`[✅ SUKSES] Canvas terkirim ke ${memberName}`);
      }
    } catch (err) {
      console.error('[❌ ERROR WELCOME CANVAS]', err.stack);
    }
  });
};
