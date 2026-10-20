import { Sandbox } from '@e2b/code-interpreter';
import { config } from '../config.js';
import {
  getSlackSandbox, saveSlackSandbox,
  getSlackSandboxesForUser, deleteSlackSandboxesForUser
} from '../db/database.js';

const executionsByThread = new Map();
const MAX_CODE_LENGTH = 8000;

function quoteShellArgument(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function withThreadLock(threadKey, callback) {
  const previous = executionsByThread.get(threadKey) || Promise.resolve();
  const current = previous.catch(() => {}).then(callback);
  executionsByThread.set(threadKey, current);
  try {
    return await current;
  } finally {
    if (executionsByThread.get(threadKey) === current) executionsByThread.delete(threadKey);
  }
}

async function getThreadSandbox(threadKey, slackUserId) {
  let sandbox;
  const savedSandboxId = getSlackSandbox(threadKey);
  if (savedSandboxId) {
    try {
      sandbox = await Sandbox.connect(savedSandboxId);
    } catch (err) {
      console.warn(`[HackiSandbox] Could not reconnect to thread sandbox; creating a fresh one: ${err.message}`);
    }
  }
  if (!sandbox) {
    sandbox = await Sandbox.create({ timeoutMs: 60 * 60 * 1000 });
    saveSlackSandbox(threadKey, sandbox.sandboxId, slackUserId);
  }
  await sandbox.setTimeout(60 * 60 * 1000);
  return sandbox;
}

export async function executeSandboxCode(threadKey, slackUserId, code, language = 'python') {
  if (!config.e2bApiKey) throw new Error('Code execution is not configured. Add E2B_API_KEY to the server environment.');
  const source = String(code || '').trim();
  if (!source) throw new Error('Add code after `run:`.');
  if (source.length > MAX_CODE_LENGTH) throw new Error(`Keep code under ${MAX_CODE_LENGTH} characters.`);
  const supportedLanguage = ['python', 'javascript', 'typescript'].includes(String(language).toLowerCase())
    ? String(language).toLowerCase()
    : 'python';

  return withThreadLock(threadKey, async () => {
    const sandbox = await getThreadSandbox(threadKey, slackUserId);
    const result = await sandbox.runCode(source, { language: supportedLanguage, timeoutMs: 30_000 });
    const parts = [
      ...(result.logs?.stdout || []),
      ...(result.logs?.stderr || []),
      ...(result.text ? [result.text] : []),
      ...(result.error ? [`${result.error.name || 'Error'}: ${result.error.value || result.error.message || 'Execution failed'}`] : [])
    ];
    const output = [...new Set(parts.map(value => String(value).trim()).filter(Boolean))].join('\n');
    return output.slice(0, 8000) || '(Code ran without printable output.)';
  });
}

export async function executeSandboxCommand(threadKey, slackUserId, command) {
  if (!config.e2bApiKey) throw new Error('Code execution is not configured. Add E2B_API_KEY to the server environment.');
  const source = String(command || '').trim();
  if (!source) throw new Error('Add a shell command to run.');
  if (source.length > 4000) throw new Error('Keep shell commands under 4000 characters.');
  return withThreadLock(threadKey, async () => {
    const sandbox = await getThreadSandbox(threadKey, slackUserId);
    const result = await sandbox.commands.run(`timeout --signal=TERM 30s sh -lc ${quoteShellArgument(source)}`, { requestTimeoutMs: 35_000 });
    const output = [result.stdout, result.stderr, result.error]
      .map(value => String(value || '').trim()).filter(Boolean).join('\n');
    return `${output || '(Command finished without output.)'}\nExit code: ${result.exitCode}`.slice(0, 8000);
  });
}

export async function readSandboxFile(threadKey, slackUserId, filePath) {
  if (!config.e2bApiKey) throw new Error('File upload is not configured. Add E2B_API_KEY to the server environment.');
  const requestedPath = String(filePath || '').trim();
  if (!requestedPath || requestedPath.length > 500 || requestedPath.includes('\0')) throw new Error('Give a valid sandbox file path.');
  return withThreadLock(threadKey, async () => {
    const sandbox = await getThreadSandbox(threadKey, slackUserId);
    const downloadUrl = await sandbox.downloadUrl(requestedPath);
    const response = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Could not read that sandbox file (HTTP ${response.status}).`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 10 * 1024 * 1024) throw new Error('Slack uploads are limited to 10 MB.');
    const data = Buffer.from(await response.arrayBuffer());
    if (!data.length) throw new Error('That sandbox file is empty.');
    if (data.length > 10 * 1024 * 1024) throw new Error('Slack uploads are limited to 10 MB.');
    const filename = requestedPath.split(/[\\/]/).filter(Boolean).at(-1) || 'sandbox-file';
    return { filename: filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150), data };
  });
}

export async function startSandboxStaticPreview(threadKey, slackUserId, directoryPath) {
  if (!config.e2bApiKey) throw new Error('Static previews are not configured. Add E2B_API_KEY to the server environment.');
  const requestedPath = String(directoryPath || '').trim();
  if (!requestedPath || requestedPath.length > 500 || requestedPath.includes('\0')) throw new Error('Give a valid sandbox directory path.');
  return withThreadLock(threadKey, async () => {
    const sandbox = await getThreadSandbox(threadKey, slackUserId);
    const start = `if ! curl -fsS --max-time 1 http://127.0.0.1:4173/ >/dev/null; then nohup python3 -m http.server 4173 --bind 0.0.0.0 --directory ${quoteShellArgument(requestedPath)} >/tmp/hacki-static-preview.log 2>&1 </dev/null & fi; sleep 1; curl -fsS --max-time 2 http://127.0.0.1:4173/ >/dev/null`;
    const result = await sandbox.commands.run(start, { requestTimeoutMs: 10_000 });
    if (result.exitCode !== 0) throw new Error('Could not serve that directory. Check that it exists and is readable.');
    return sandbox.getHost(4173);
  });
}

export async function removeUserSandboxes(slackUserId) {
  const ids = getSlackSandboxesForUser(slackUserId);
  let stopped = 0;
  await Promise.all(ids.map(async id => {
    try {
      await Sandbox.kill(id);
      stopped += 1;
    } catch (err) {
      console.warn(`[HackiSandbox] Could not terminate sandbox during data erasure: ${err.message}`);
    }
  }));
  deleteSlackSandboxesForUser(slackUserId);
  return { found: ids.length, stopped };
}
