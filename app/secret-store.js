const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { app, safeStorage } = require('electron');

const SECRET_SETTING_KEYS = [
  'omdbKey',
  'tmdbKey',
  'tvdbKey',
  'imgbbKey',
  'ptscreensKey',
  'unit3dApiKey',
  'qbitPassword',
  'transmissionPassword',
  'torrentPasskey'
];

let storePath = null;
let fallbackKey = null;

function getUserDataPath() {
  return app.getPath('userData');
}

function getSecretStorePath() {
  if (!storePath) {
    storePath = path.join(getUserDataPath(), 'secrets.json');
  }
  return storePath;
}

function getFallbackKey() {
  if (fallbackKey) {
    return fallbackKey;
  }
  const envKey = String(process.env.SHRI_TOOLS_SECRET_KEY || '').trim();
  if (envKey) {
    fallbackKey = crypto.createHash('sha256').update(envKey).digest();
    return fallbackKey;
  }
  const keyFile = path.join(getUserDataPath(), '.secret-key');
  if (fs.existsSync(keyFile)) {
    fallbackKey = fs.readFileSync(keyFile);
    return fallbackKey;
  }
  fallbackKey = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, fallbackKey, { mode: 0o600 });
  return fallbackKey;
}

function encryptSecret(value) {
  const text = String(value || '');
  if (!text) {
    return '';
  }
  if (safeStorage?.isEncryptionAvailable?.()) {
    return `safe:${safeStorage.encryptString(text).toString('base64')}`;
  }
  const iv = crypto.randomBytes(12);
  const key = getFallbackKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `aesgcm:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value) {
  const text = String(value || '');
  if (!text) {
    return '';
  }
  if (text.startsWith('safe:')) {
    const payload = Buffer.from(text.slice(5), 'base64');
    return safeStorage.decryptString(payload);
  }
  if (text.startsWith('aesgcm:')) {
    const [, ivB64, tagB64, dataB64] = text.split(':');
    const iv = Buffer.from(ivB64 || '', 'base64');
    const authTag = Buffer.from(tagB64 || '', 'base64');
    const encrypted = Buffer.from(dataB64 || '', 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getFallbackKey(), iv);
    decipher.setAuthTag(authTag);
    return `${decipher.update(encrypted, undefined, 'utf8')}${decipher.final('utf8')}`;
  }
  return '';
}

function readSecretFile() {
  const filePath = getSecretStorePath();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSecretFile(data) {
  const filePath = getSecretStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function extractSecrets(settings = {}) {
  const secrets = {};
  for (const key of SECRET_SETTING_KEYS) {
    const value = String(settings?.[key] || '').trim();
    if (value) {
      secrets[key] = value;
    }
  }
  return secrets;
}

function stripSecrets(settings = {}) {
  const sanitized = { ...(settings || {}) };
  let hadSecrets = false;
  for (const key of SECRET_SETTING_KEYS) {
    if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
      delete sanitized[key];
      hadSecrets = true;
    }
  }
  return { sanitized, hadSecrets };
}

function loadStoredSecrets() {
  const file = readSecretFile();
  const result = {};
  for (const key of SECRET_SETTING_KEYS) {
    result[key] = decryptSecret(file[key] || '');
  }
  return result;
}

function saveStoredSecrets(settings = {}) {
  const existing = readSecretFile();
  const secrets = extractSecrets(settings);
  const next = { ...existing };
  for (const key of SECRET_SETTING_KEYS) {
    const value = secrets[key];
    if (value) {
      next[key] = encryptSecret(value);
    } else {
      delete next[key];
    }
  }
  writeSecretFile(next);
  return true;
}

module.exports = {
  SECRET_SETTING_KEYS,
  loadStoredSecrets,
  saveStoredSecrets,
  stripSecrets
};