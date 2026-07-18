import { createCanvas, loadImage } from 'canvas';

export const handleWelcomeEvent = (sock, featureToggles) => {
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        
        // Hanya proses aksi masuk (add) dan keluar (remove)
        if (action !== 'add' && action !== 'remove') return;

        if (featureToggles && featureToggles.welcome_canvas === false) {
            console.log('[⚙️ SYSTEM] Welcome Canvas OFF, membatalkan render.');
            return;
        }

        const isAdd = action === 'add';
        const actionText = isAdd ? 'WELCOME!' : 'GOODBYE!';
        const themeColor = isAdd ? '#00ffcc' : '#ff3366'; // Cyan untuk Welcome, Merah untuk Goodbye
        
        console.log(`\n[🚨 BAILEYS EVENT] Aksi: ${action} | Peserta Detail:`, JSON.stringify(participants, null, 2));

        try {
            console.log(`[⏳ PROSES] Merender banner ${actionText} untuk ${participants.length} member...`);
            
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
                    console.log(`[⚠️ GAGAL DP] Gagal mengambil foto. Alasan: ${err.message}`);
                    ppUrl = null; 
                }

                if (!ppUrl) {
                    console.log(`[ℹ️ INFO] Menggunakan avatar default untuk ${targetJid}.`);
                    ppUrl = 'https://i.ibb.co/3Fh9V6p/avatar-contact.png'; 
                }

                const canvas = createCanvas(800, 300);
                const ctx = canvas.getContext('2d');

                // Render Background (Beda warna saat leave)
                const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                gradient.addColorStop(0, '#0f2027'); 
                gradient.addColorStop(0.5, isAdd ? '#203a43' : '#3a2026'); // Gelap kebiruan vs Gelap kemerahan
                gradient.addColorStop(1, isAdd ? '#2c5364' : '#532c34'); 
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                for(let i = 0; i < 100; i++) {
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

                // Render Border Avatar dengan warna tema
                ctx.beginPath();
                ctx.arc(150, 150, 100, 0, Math.PI * 2, true);
                ctx.strokeStyle = themeColor; 
                ctx.lineWidth = 10;
                ctx.stroke();

                ctx.font = 'bold 55px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(actionText, 300, 120);

                ctx.font = '30px Arial';
                ctx.fillStyle = '#cccccc';
                const memberName = targetJid.split('@')[0];
                ctx.fillText(`@${memberName}`, 300, 170);

                ctx.font = 'bold 35px Arial';
                ctx.fillStyle = themeColor;
                const shortGroupName = groupName.length > 22 ? groupName.substring(0, 22) + '...' : groupName;
                ctx.fillText(shortGroupName, 300, 230);

                const buffer = canvas.toBuffer('image/png');
                
                // Pesan Caption Berbeda
                const captionMsg = isAdd 
                    ? `Halo @${memberName}! 👋\n\nSelamat datang di grup *${groupName}*.\nJangan lupa perkenalkan diri ya!`
                    : `Selamat tinggal @${memberName} 🥀\n\nSemoga tenang di alam sana.`;

                await sock.sendMessage(id, {
                    image: buffer,
                    caption: captionMsg,
                    mentions: [targetJid]
                });
                console.log(`[✅ SUKSES] Canvas ${actionText} terkirim ke ${memberName}`);
            }
        } catch (err) {
            console.error('[❌ ERROR CANVAS EVENT]', err.stack);
        }
    });
};
