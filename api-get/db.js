const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'database.json');

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readDB() {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return { jobs: [], keys: [], users: [], settings: {} };
  }
}

function writeDB(data) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Jobs
function getAllJobs() {
  const db = readDB();
  return (db.jobs || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getJob(id) {
  return (readDB().jobs || []).find(j => j.id === id) || null;
}

function createJob(job) {
  const db = readDB();
  if (!db.jobs) db.jobs = [];
  db.jobs.unshift(job);
  writeDB(db);
  return job;
}

function updateJob(id, updates) {
  const db = readDB();
  const idx = (db.jobs || []).findIndex(j => j.id === id);
  if (idx === -1) return null;
  db.jobs[idx] = { ...db.jobs[idx], ...updates, updatedAt: new Date().toISOString() };
  writeDB(db);
  return db.jobs[idx];
}

function deleteJob(id) {
  const db = readDB();
  db.jobs = (db.jobs || []).filter(j => j.id !== id);
  writeDB(db);
}

// Keys
function saveKey(keyData) {
  const db = readDB();
  if (!db.keys) db.keys = [];
  db.keys.unshift(keyData);
  writeDB(db);
}

function deleteKey(id) {
  const db = readDB();
  db.keys = (db.keys || []).filter(k => k.id !== id);
  writeDB(db);
}

function getAllKeys() {
  return (readDB().keys || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  getAllJobs, getJob, createJob, updateJob, deleteJob,
  saveKey, deleteKey, getAllKeys,
};