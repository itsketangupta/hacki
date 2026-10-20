import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { deleteSlackModelOverride, getSlackModelOverride, saveSlackModelOverride } from '../db/database.js';

export const SLACK_MODEL_PROVIDERS = Object.freeze({
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  groq: { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  together: { name: 'Together AI', baseUrl: 'https://api.together.xyz/v1' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  google: { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  mistral: { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' }
});

function encryptionKey() {
  const encoded = config.slackUserSecretsEncryptionKey;
  const key = Buffer.from(encoded, 'base64');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('Set SLACK_USER_SECRETS_ENCRYPTION_KEY to a base64 encoded 32-byte key.');
  }
  return key;
}

export function canEncryptUserModelKeys() {
  try { encryptionKey(); return true; } catch { return false; }
}

export function saveUserModelOverride(slackUserId, { provider, model, apiKey }) {
  const providerConfig = SLACK_MODEL_PROVIDERS[provider];
  const normalizedModel = String(model || '').trim().slice(0, 180);
  const secret = String(apiKey || '').trim();
  if (!slackUserId || !providerConfig) throw new Error('Choose a supported model provider.');
  if (!normalizedModel || !/^[\w./:-]+$/.test(normalizedModel)) throw new Error('Enter a valid model identifier.');
  if (!secret || secret.length > 500) throw new Error('Enter a valid provider API key.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(slackUserId));
  const encryptedApiKey = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  saveSlackModelOverride(slackUserId, {
    provider,
    model: normalizedModel,
    encryptedApiKey: encryptedApiKey.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  });
}

export function getUserModelOverride(slackUserId) {
  const row = getSlackModelOverride(slackUserId);
  if (!row) return null;
  const provider = SLACK_MODEL_PROVIDERS[row.provider];
  if (!provider) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(row.iv, 'base64'));
    decipher.setAAD(Buffer.from(slackUserId));
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
    const apiKey = Buffer.concat([
      decipher.update(Buffer.from(row.encryptedApiKey, 'base64')),
      decipher.final()
    ]).toString('utf8');
    return { provider: row.provider, providerName: provider.name, baseUrl: provider.baseUrl, model: row.model, apiKey };
  } catch (error) {
    throw new Error('Could not decrypt your saved model key. Check SLACK_USER_SECRETS_ENCRYPTION_KEY and save your key again.');
  }
}

export function getUserModelOverrideSummary(slackUserId) {
  const row = getSlackModelOverride(slackUserId);
  if (!row) return null;
  const provider = SLACK_MODEL_PROVIDERS[row.provider];
  return provider ? { provider: provider.name, model: row.model } : null;
}

export function clearUserModelOverride(slackUserId) {
  return deleteSlackModelOverride(slackUserId);
}
