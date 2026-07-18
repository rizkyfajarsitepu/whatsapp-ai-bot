import fs from 'fs';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'groups_db.json');

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
        db[groupId] = { name: groupName || 'Grup Tanpa Nama', verified: false };
        saveGroupsDB(db);
    } else if (groupName && db[groupId].name !== groupName) {
        db[groupId].name = groupName;
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
