import { config } from '../config.js';

const GITHUB_API = 'https://api.github.com';

async function githubRequest(path, { method = 'GET', body, token = '' } = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'HackiSlackAssistant',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000)
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 404 ? 'Public repository or file not found.' :
      response.status === 409 || response.status === 422 ? 'GitHub rejected the edit because the file changed or the request is invalid. Review the latest file and prepare the edit again.' :
      `GitHub returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

const githubGet = path => githubRequest(path);

export async function getPublicGitHubRepository(owner, repo) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new Error('Use a GitHub repository in `owner/repo` format.');
  }
  const data = await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  if (data.private) throw new Error('Hacki only inspects public repositories.');
  return {
    name: data.full_name,
    description: data.description || 'No description provided.',
    language: data.language || 'Not specified',
    stars: Number(data.stargazers_count || 0),
    openIssues: Number(data.open_issues_count || 0),
    updatedAt: data.pushed_at,
    url: data.html_url,
    defaultBranch: data.default_branch
  };
}

export async function getPublicGitHubIssues(owner, repo, limit = 5) {
  const data = await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=${Math.min(Math.max(Number(limit) || 5, 1), 10)}`);
  return data.filter(item => !item.pull_request).map(item => ({
    title: String(item.title || '').slice(0, 200),
    number: item.number,
    url: item.html_url,
    createdAt: item.created_at
  }));
}

export async function getPublicGitHubFile(owner, repo, filePath, ref = '') {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new Error('Use a GitHub repository in `owner/repo` format.');
  }
  const normalizedPath = String(filePath || '').trim().replace(/^\/+/, '');
  if (!normalizedPath || normalizedPath.length > 500 || normalizedPath.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Give a valid repository file path.');
  }
  const encodedPath = normalizedPath.split('/').map(encodeURIComponent).join('/');
  const refQuery = ref ? `?ref=${encodeURIComponent(String(ref).slice(0, 200))}` : '';
  const data = await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${refQuery}`);
  if (Array.isArray(data) || data.type !== 'file' || typeof data.content !== 'string') {
    throw new Error('That path is not a readable file.');
  }
  if (data.encoding !== 'base64') throw new Error('GitHub returned an unsupported file encoding.');
  const content = Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8');
  if (content.includes('\u0000')) throw new Error('Binary files cannot be displayed as text.');
  return {
    name: data.name,
    path: data.path,
    sha: data.sha,
    size: Number(data.size || 0),
    url: data.html_url,
    content: content.slice(0, 12_000),
    truncated: content.length > 12_000
  };
}

export function canEditGitHubFiles() {
  return Boolean(config.githubToken && config.githubAllowedOwners.length && config.githubAllowedSlackUsers.length);
}

export async function commitGitHubFileEdit({ owner, repo, path: filePath, content, message, expectedSha, slackUserId }) {
  const token = config.githubToken;
  if (!canEditGitHubFiles() || !config.githubAllowedOwners.includes(String(owner || '').toLowerCase()) || !config.githubAllowedSlackUsers.includes(String(slackUserId || ''))) {
    throw new Error('GitHub writes are not enabled for this repository owner or Slack account.');
  }
  if (!String(content || '').trim() || String(content).length > 100_000 || !String(message || '').trim()) throw new Error('GitHub file edits need a commit message and content under 100,000 characters.');
  const current = await getPublicGitHubFile(owner, repo, filePath);
  if (current.sha !== expectedSha) throw new Error('The file changed after you reviewed the preview. Fetch it again and prepare a new edit.');
  const normalizedPath = current.path.split('/').map(encodeURIComponent).join('/');
  const result = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${normalizedPath}`, {
    method: 'PUT', token,
    body: {
      message: String(message || '').trim().slice(0, 180),
      content: Buffer.from(String(content || ''), 'utf8').toString('base64'),
      sha: expectedSha,
      ...(config.githubCommitterName && config.githubCommitterEmail ? {
        committer: { name: config.githubCommitterName, email: config.githubCommitterEmail }
      } : {}),
      author: { name: 'Hacki Slack user', email: `slack-${String(slackUserId || '').replace(/[^A-Z0-9]/gi, '').slice(0, 32)}@users.noreply.github.com` }
    }
  });
  return { url: result?.content?.html_url || result?.commit?.html_url || `https://github.com/${owner}/${repo}/blob/HEAD/${current.path}` };
}
