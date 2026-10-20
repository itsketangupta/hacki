import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  rootDir,
  dataDir: path.join(rootDir, 'data'),
  teamFile: path.join(rootDir, 'data', 'team.json'),
  yswsFile: path.join(rootDir, 'data', 'ysws.json'),
  announcementsFile: path.join(rootDir, 'data', 'announcements.json'),
  
  // Hack Club AI Gateway
  aiApiKey: process.env.AI_API_KEY || '',
  aiBaseUrl: (process.env.AI_BASE_URL || 'https://ai.hackclub.com/proxy/v1').replace(/\/$/, ''),
  aiModel: process.env.AI_MODEL || 'openai/gpt-4o-mini',
  aiFallbackApiKey: process.env.AI_FALLBACK_API_KEY || '',
  aiFallbackBaseUrl: (process.env.AI_FALLBACK_BASE_URL || '').replace(/\/$/, ''),
  aiFallbackModel: process.env.AI_FALLBACK_MODEL || '',
  slackModelKeysEncryptionKey: process.env.SLACK_MODEL_KEYS_ENCRYPTION_KEY || '',
  slackUserSecretsEncryptionKey: process.env.SLACK_USER_SECRETS_ENCRYPTION_KEY || process.env.SLACK_MODEL_KEYS_ENCRYPTION_KEY || '',
  exaApiKey: process.env.EXA_API_KEY || '',
  browserCdpUrl: process.env.BROWSER_CDP_URL || '',
  githubToken: process.env.GITHUB_TOKEN || '',
  githubAllowedOwners: (process.env.GITHUB_ALLOWED_OWNERS || '').split(',').map(owner => owner.trim().toLowerCase()).filter(Boolean),
  githubAllowedSlackUsers: (process.env.GITHUB_ALLOWED_SLACK_USERS || '').split(',').map(id => id.trim()).filter(Boolean),
  githubCommitterName: process.env.GITHUB_COMMITTER_NAME || '',
  githubCommitterEmail: process.env.GITHUB_COMMITTER_EMAIL || '',
  e2bApiKey: process.env.E2B_API_KEY || '',
  smtpUrl: process.env.SMTP_URL || '',
  mailFrom: process.env.MAIL_FROM || '',
  
  // Slack Integration
  slackBotToken: process.env.SLACK_BOT_TOKEN || '',
  slackAppToken: process.env.SLACK_APP_TOKEN || '',
  slackHackiChannel: process.env.SLACK_HACKI_CHANNEL || 'hacki',
  enableSlackBot: process.env.ENABLE_SLACK_BOT !== 'false',
  enableSlackSync: process.env.ENABLE_SLACK_SYNC !== 'false',
  slackSyncIntervalMs: Number(process.env.SLACK_SYNC_INTERVAL_MS || 300000),
  approvedChannels: (process.env.SLACK_APPROVED_CHANNELS || 'happenings,ysws,ysws-ads,ysws-bulletin,bounty,community-bounties,hc-opportunities,opportunities,phantom-bulletin,crescent-bulletin,horizons-bulletin,macondo-bulletin,pixl-bulletin,tagless-bulletin,venture-bulletin,zoneout-announcements,terra-announcements,announcements,slacker-news,the-mothership')
    .split(',')
    .map(c => c.trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean),
  newsKeywords: (process.env.NEWS_KEYWORDS || 'reviewer,review,fulfil,fulfill,fulfillment,hiring,recruiting,opportunity,volunteer,deadline,launch,ysws,bounty,grant,stipend')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean),

  // Hack Club Auth
  authClientId: process.env.HACKCLUB_CLIENT_ID || 'e26af0e5bf638208efa68e2df56a0c10',
  authClientSecret: process.env.HACKCLUB_CLIENT_SECRET || '561892e90f34f125ca1d52c6dcd2e7b4a7886ae64e71cc63df1553f2566ef824',
  authRedirectUri: process.env.HACKCLUB_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
};
