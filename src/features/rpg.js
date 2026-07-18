import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'rpg_db.json');

let rpgDB = {};
if (fs.existsSync(dbPath)) {
    rpgDB = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}

const saveDB = () => fs.writeFileSync(dbPath, JSON.stringify(rpgDB, null, 2));

export const getPangkat = (level) => {
    if (level >= 100) return '👑 Presiden';
    if (level >= 91) return '💼 Menteri';
    if (level >= 71) return '🏛️ Gubernur';
    if (level >= 51) return '🏙️ Bupati';
    if (level >= 31) return '👔 Camat';
    if (level >= 16) return '🏡 Kepala Desa';
    if (level >= 6) return '🏘️ Ketua RT';
    return '📑 Honorer';
};

export const handleLeveling = async (sock, msg, featureToggles) => {
    if (featureToggles && featureToggles.rpg_leveling === false) return;

    const isGroup = msg.key.remoteJid.endsWith('@g.us');
    if (!isGroup) return;

    const sender = msg.key.participant || msg.key.remoteJid;
    if (!sender) return;

    if (!rpgDB[sender]) {
        rpgDB[sender] = { xp: 0, level: 0, lastChat: 0 };
    }

    const now = Date.now();
    if (now - rpgDB[sender].lastChat > 60000) {
        const addedXp = Math.floor(Math.random() * 11) + 5;
        rpgDB[sender].xp += addedXp;
        rpgDB[sender].lastChat = now;

        const newLevel = Math.floor(Math.sqrt(rpgDB[sender].xp / 10));

        if (newLevel > rpgDB[sender].level) {
            rpgDB[sender].level = newLevel;
            const pangkat = getPangkat(newLevel);
            
            const notifMsg = `🎊 *PELANTIKAN JABATAN BARU* 🎊\n\nSelamat @${sender.split('@')[0]}!\nKinerjamu di grup sangat baik, kamu telah naik ke Level ${newLevel}.\n\nJabatan barumu sekarang adalah: *${pangkat}* 🫡`;
            
            await sock.sendMessage(msg.key.remoteJid, { 
                text: notifMsg, 
                mentions: [sender] 
            });
        }
        saveDB();
    }
};

export const getProfileStats = (targetJid, isAdmin = false) => {
    const user = rpgDB[targetJid] || { xp: 0, level: 0 };
    const nextLevelXp = Math.pow(user.level + 1, 2) * 10;
    const pangkat = getPangkat(user.level);

    let ktpMsg = `📊 *KARTU TANDA PEJABAT (KTP)* 📊\n\n👤 Nama: @${targetJid.split('@')[0]}\n`;

    if (isAdmin) {
        ktpMsg += `🆔 ID Sistem: ${targetJid}\n`;
    }

    ktpMsg += `🎖️ Jabatan: *${pangkat}*\n📈 Level: ${user.level}\n✨ XP: ${user.xp} / ${nextLevelXp}\n\n_Rajin-rajinlah rapat (chat) di grup agar cepat naik jabatan!_`;

    return ktpMsg;
};

export const getRpgDB = () => {
    return rpgDB;
};

export const suntikXP = (sender, amountXp) => {
    let cleanJid = sender.trim();

    if (!cleanJid.endsWith('@lid')) {
        let parsedNumber = cleanJid.split('@')[0].replace(/[^0-9]/g, '');
        if (parsedNumber.startsWith('0')) {
            parsedNumber = '62' + parsedNumber.substring(1);
        }
        cleanJid = parsedNumber + '@s.whatsapp.net';
    }

    if (!rpgDB[cleanJid]) {
        rpgDB[cleanJid] = { xp: 0, level: 0, lastChat: 0 };
    }

    const xpToAdd = parseInt(amountXp);
    if (isNaN(xpToAdd) || xpToAdd <= 0) throw new Error("Jumlah XP tidak valid!");

    rpgDB[cleanJid].xp += xpToAdd;

    const newLevel = Math.floor(Math.sqrt(rpgDB[cleanJid].xp / 10));
    rpgDB[cleanJid].level = newLevel;
    saveDB();

    return {
        jid: cleanJid,
        xp: rpgDB[cleanJid].xp,
        level: rpgDB[cleanJid].level,
        pangkat: getPangkat(newLevel)
    };
};
