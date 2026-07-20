import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'groups_db.json');

const DEFAULT_FEATURES = {
  ai_chat: true,
  stiker: true,
  tts: true,
  stt: true,
  downloader: true,
  image_tools: true,
  info_tools: true,
  utility_tools: true,
  ringkas: true,
  persona: true,
  menfess: true,
  welcome_canvas: true,
  rpg_leveling: true,
};

export const getGroupsDB = () => {
    if (!fs.existsSync(dbPath)) return {};
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
};

export const saveGroupsDB = (data) => {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

export const verifyGroupStatus = (groupId, groupName) => {
    const db = getGroupsDB();
    if (!db[groupId]) {
        db[groupId] = { name: groupName || 'Grup Tanpa Nama', verified: false, features: { ...DEFAULT_FEATURES } };
        saveGroupsDB(db);
    } else if (groupName && db[groupId].name !== groupName) {
        db[groupId].name = groupName;
        saveGroupsDB(db);
    }
    if (!db[groupId].features) {
        db[groupId].features = { ...DEFAULT_FEATURES };
        saveGroupsDB(db);
    }
    return db[groupId].verified;
};

export const toggleGroupVerification = (groupId) => {
    const db = getGroupsDB();
    if (db[groupId]) {
        db[groupId].verified = !db[groupId].verified;
        saveGroupsDB(db);
        return db[groupId].verified;
    }
    return false;
};

export const getGroupFeatures = (groupId) => {
    const db = getGroupsDB();
    if (!db[groupId]) {
        db[groupId] = { name: 'Grup Tanpa Nama', verified: false, features: { ...DEFAULT_FEATURES } };
        saveGroupsDB(db);
    }
    if (!db[groupId].features) {
        db[groupId].features = { ...DEFAULT_FEATURES };
        saveGroupsDB(db);
    }
    return db[groupId].features;
};

export const setGroupFeatures = (groupId, features) => {
    const db = getGroupsDB();
    if (!db[groupId]) {
        db[groupId] = { name: 'Grup Tanpa Nama', verified: false, features: { ...DEFAULT_FEATURES } };
    }
    db[groupId].features = features;
    saveGroupsDB(db);
    return db[groupId].features;
};

export { DEFAULT_FEATURES };
