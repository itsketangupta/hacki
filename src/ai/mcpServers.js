import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { config } from '../config.js';
import { deleteSlackMcpServer, getSlackMcpServers, saveSlackMcpServer } from '../db/database.js';

const MCP_PROTOCOL_VERSION = '2025-11-25';
const MAX_SERVERS_PER_USER = 5;
const MAX_TOOLS_PER_SERVER = 30;
const MAX_TOOLS_TOTAL = 80;
const MAX_TOOL_RESULT_LENGTH = 18_000;

function getEncryptionKey() {
  const encoded = config.slackUserSecretsEncryptionKey;
  const key = Buffer.from(encoded, 'base64');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('Set SLACK_USER_SECRETS_ENCRYPTION_KEY to a base64 encoded 32-byte key.');
  }
  return key;
}

function privateIpv4(host) {
  const [a, b, c] = host.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113);
}

function privateAddress(address) {
  const normalized = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
  const version = isIP(normalized);
  if (version === 4) return privateIpv4(normalized);
  if (version === 6) {
    if (normalized.startsWith('::ffff:')) return true;
    const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return first < 0x2000 || first > 0x3fff || normalized.startsWith('2001:db8:');
  }
  return true;
}

function parseEndpoint(value) {
  let endpoint;
  try { endpoint = new URL(String(value || '').trim()); } catch { throw new Error('Enter a valid public HTTPS MCP endpoint.'); }
  const hostname = endpoint.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      hostname.endsWith('.test') || hostname.endsWith('.example') || hostname.endsWith('.invalid') || isIP(hostname)) {
    throw new Error('MCP servers must use a public HTTPS endpoint without credentials, query strings, or fragments.');
  }
  return endpoint;
}

async function assertPublicEndpoint(endpoint) {
  const addresses = await lookup(endpoint.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) {
    throw new Error('MCP server endpoints must resolve only to public IP addresses.');
  }
}

function encryptToken(slackUserId, token) {
  const secret = String(token || '').trim();
  if (!secret) return { encryptedToken: null, iv: null, authTag: null };
  if (secret.length > 1000) throw new Error('Bearer tokens must be 1000 characters or fewer.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  cipher.setAAD(Buffer.from(slackUserId));
  const encryptedToken = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { encryptedToken: encryptedToken.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

function decryptToken(row) {
  if (!row.encryptedToken) return '';
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(row.iv, 'base64'));
  decipher.setAAD(Buffer.from(row.slackUserId));
  decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(row.encryptedToken, 'base64')), decipher.final()]).toString('utf8');
}

export function listSlackMcpServerSummaries(slackUserId) {
  return getSlackMcpServers(slackUserId).map(({ serverId, name, endpoint }) => ({ serverId, name, endpoint }));
}

export async function saveUserMcpServer(slackUserId, { name: rawName, endpoint: rawEndpoint, bearerToken }) {
  const name = String(rawName || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 32);
  if (!slackUserId || !name || !/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new Error('Enter a server name using letters, numbers, hyphens, or underscores.');
  const endpoint = parseEndpoint(rawEndpoint);
  if (getSlackMcpServers(slackUserId).length >= MAX_SERVERS_PER_USER) throw new Error(`You can configure up to ${MAX_SERVERS_PER_USER} MCP servers.`);
  const token = encryptToken(slackUserId, bearerToken);
  const serverId = randomUUID();
  const candidate = { serverId, slackUserId, name, endpoint: endpoint.href, ...token };
  await connectAndListTools(candidate);
  try {
    saveSlackMcpServer(candidate);
  } catch (error) {
    if (/UNIQUE constraint failed/.test(error.message)) throw new Error('You already have an MCP server with that name.');
    throw error;
  }
}

export function removeUserMcpServer(slackUserId, serverId) {
  return deleteSlackMcpServer(slackUserId, serverId);
}

function decodeResponseText(text) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed.jsonrpc === '2.0') return parsed;
    } catch {}
  }
  try { return JSON.parse(text); } catch { throw new Error('MCP server returned an unreadable response.'); }
}

async function mcpRequest(server, token, body, session = null, protocolVersion = null) {
  const endpoint = parseEndpoint(server.endpoint);
  await assertPublicEndpoint(endpoint);
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (session) headers['Mcp-Session-Id'] = session;
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;
  const response = await fetch(endpoint, {
    method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(12_000)
  });
  if (response.status === 202 || response.status === 204) return { result: null, session: response.headers.get('mcp-session-id') || session };
  if (!response.ok) throw new Error(`MCP server returned HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 1_000_000) throw new Error('MCP server response exceeded 1 MB.');
  const text = await response.text();
  if (!text.trim() && body.id === undefined) return { result: null, session: response.headers.get('mcp-session-id') || session };
  if (text.length > 1_000_000) throw new Error('MCP server response exceeded 1 MB.');
  const json = decodeResponseText(text);
  if (json.error) throw new Error(String(json.error.message || 'MCP request failed').slice(0, 300));
  return { result: json.result, session: response.headers.get('mcp-session-id') || session };
}

async function connectAndListTools(row) {
  const token = decryptToken(row);
  const endpoint = parseEndpoint(row.endpoint);
  await assertPublicEndpoint(endpoint);
  const init = await mcpRequest(row, token, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'Hacki', version: '1.0.0' }
    }
  });
  const protocolVersion = init.result?.protocolVersion || MCP_PROTOCOL_VERSION;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(protocolVersion)) throw new Error('MCP server selected an invalid protocol version.');
  const session = init.session;
  await mcpRequest(row, token, { jsonrpc: '2.0', method: 'notifications/initialized' }, session, protocolVersion);
  let cursor;
  const tools = [];
  for (let page = 0; page < 3; page += 1) {
    const request = { jsonrpc: '2.0', id: page + 2, method: 'tools/list', params: cursor ? { cursor } : {} };
    const listed = await mcpRequest(row, token, request, session, protocolVersion);
    tools.push(...(Array.isArray(listed.result?.tools) ? listed.result.tools : []));
    cursor = listed.result?.nextCursor;
    if (!cursor || tools.length >= MAX_TOOLS_PER_SERVER) break;
  }
  return { row, token, session, protocolVersion, tools: tools.slice(0, MAX_TOOLS_PER_SERVER) };
}

function safeInputSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.type !== 'object') {
    return { type: 'object', properties: {}, additionalProperties: false };
  }
  try {
    const serialized = JSON.stringify(schema);
    if (serialized.length > 12_000) return { type: 'object', properties: {}, additionalProperties: false };
    return JSON.parse(serialized);
  } catch {
    return { type: 'object', properties: {}, additionalProperties: false };
  }
}

export async function loadSlackMcpTools(slackUserId) {
  const rows = getSlackMcpServers(slackUserId);
  if (!rows.length) return { definitions: [], registry: {} };
  const connected = await Promise.all(rows.map(async row => {
    try { return await connectAndListTools(row); }
    catch (error) {
      console.warn(`[HackiMCP] Could not load ${row.name}: ${error.message}`);
      return null;
    }
  }));
  const definitions = [];
  const registry = {};
  for (const connection of connected.filter(Boolean)) {
    if (definitions.length >= MAX_TOOLS_TOTAL) break;
    for (const tool of connection.tools) {
      if (definitions.length >= MAX_TOOLS_TOTAL) break;
      if (!tool || typeof tool.name !== 'string' || !tool.name.trim()) continue;
      const safeServerId = connection.row.serverId.replace(/-/g, '').slice(0, 10);
      const safeToolName = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 45);
      const functionName = `mcp_${safeServerId}_${safeToolName}`.slice(0, 64);
      if (registry[functionName]) continue;
      const description = `[User-configured MCP server: ${connection.row.name}] ${String(tool.description || tool.title || tool.name).slice(0, 900)}`;
      definitions.push({
        type: 'function', function: {
          name: functionName,
          description,
          parameters: safeInputSchema(tool.inputSchema)
        }
      });
      registry[functionName] = { connection, toolName: tool.name };
    }
  }
  return { definitions, registry };
}

export async function callSlackMcpTool(functionName, args, registry) {
  const entry = registry?.[functionName];
  if (!entry) throw new Error('That MCP tool is no longer available. Ask Hacki to try again.');
  const { connection, toolName } = entry;
  const response = await mcpRequest(connection.row, connection.token, {
    jsonrpc: '2.0', id: 10, method: 'tools/call',
    params: { name: toolName, arguments: args && typeof args === 'object' ? args : {} }
  }, connection.session, connection.protocolVersion);
  const result = response.result || {};
  const serialized = JSON.stringify(result.structuredContent || result.content || result);
  return {
    result: `${result.isError ? 'MCP tool reported an error. ' : ''}${String(serialized || '').slice(0, MAX_TOOL_RESULT_LENGTH)}`,
    sources: []
  };
}
