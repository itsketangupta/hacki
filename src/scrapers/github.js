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
    owner: data.owner?.login || owner,
    ownerUrl: data.owner?.html_url || `https://github.com/${owner}`,
    description: data.description || 'No description provided.',
    language: data.language || 'Not specified',
    stars: Number(data.stargazers_count || 0),
    openIssues: Number(data.open_issues_count || 0),
    updatedAt: data.pushed_at,
    url: data.html_url,
    defaultBranch: data.default_branch
  };
}

export async function getPublicGitHubLanguages(owner, repo) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new Error('Use a GitHub repository in `owner/repo` format.');
  }
  return githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`);
}

export async function getPublicGitHubReadme(owner, repo) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new Error('Use a GitHub repository in `owner/repo` format.');
  }
  const data = await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`);
  if (data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error('GitHub did not return a readable README.');
  return {
    name: String(data.name || 'README.md'),
    url: String(data.html_url || `https://github.com/${owner}/${repo}/blob/HEAD/README.md`),
    text: Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8').slice(0, 20000)
  };
}

export async function getPublicGitHubUser(username) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)) throw new Error('Invalid GitHub username.');
  const data = await githubGet(`/users/${encodeURIComponent(username)}`);
  return { login: data.login, name: data.name || data.login, url: data.html_url };
}

const TEXT_REPO_FILE = /\.(?:md|mdx|txt|json|ya?ml|toml|js|jsx|mjs|cjs|ts|tsx|css|html|htm|py|go|rs|java|kt|sh|sql|graphql|gql|vue|svelte)$/i;
const SKIP_REPO_PATH = /(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git|\.next|\.cache)(?:\/|$)|(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock)$/i;

/** Search the readable source and documentation files of a public repository. */
export async function searchPublicGitHubRepository(owner, repo, query = '', { maxFiles = 10 } = {}) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new Error('Use a GitHub repository in `owner/repo` format.');
  }
  const repository = await getPublicGitHubRepository(owner, repo);
  const ref = repository.defaultBranch || 'HEAD';
  const tree = await githubGet(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const entries = (tree.tree || []).filter(item => item.type === 'blob' && item.path && TEXT_REPO_FILE.test(item.path) && !SKIP_REPO_PATH.test(item.path) && Number(item.size || 0) <= 150_000);
  const stopWords = new Set(['about', 'after', 'again', 'also', 'are', 'can', 'could', 'deep', 'does', 'find', 'from', 'have', 'help', 'here', 'inside', 'into', 'just', 'more', 'most', 'repo', 'repository', 'search', 'show', 'some', 'tell', 'that', 'the', 'their', 'them', 'this', 'through', 'what', 'which', 'with', 'would', 'you', 'your']);
  const terms = [...new Set((String(query).toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []).filter(term => !stopWords.has(term)))].slice(0, 12);
  const pathScore = filePath => {
    const normalized = filePath.toLowerCase();
    let score = terms.reduce((sum, term) => sum + (normalized.includes(term) ? 8 : 0), 0);
    if (/^(readme|contributing|architecture|docs?)(\.|\/|$)/i.test(filePath)) score += 20;
    if (/^(package\.json|vite\.config|tsconfig|pyproject\.toml|cargo\.toml|go\.mod|requirements)/i.test(filePath)) score += 14;
    if (/^(src\/)?(index|main|app|server|config)\.[^/]+$/i.test(filePath)) score += 11;
    if (/^src\//i.test(filePath)) score += 5;
    if (/^client\//i.test(filePath)) score += 3;
    if (/\.(?:test|spec)\.[^.]+$/i.test(filePath)) score -= 3;
    return score;
  };
  const candidates = [...entries].sort((a, b) => pathScore(b.path) - pathScore(a.path) || a.path.localeCompare(b.path)).slice(0, Math.min(48, entries.length));
  const fetched = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < candidates.length) {
      const entry = candidates[nextIndex++];
      const encodedPath = entry.path.split('/').map(encodeURIComponent).join('/');
      const encodedRef = String(ref).split('/').map(encodeURIComponent).join('/');
      const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodedRef}/${encodedPath}`;
      try {
        const response = await fetch(rawUrl, { signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': 'HackiSlackAssistant' } });
        if (!response.ok) continue;
        const content = (await response.text()).slice(0, 40_000);
        if (content.includes('\u0000')) continue;
        const lower = content.toLowerCase();
        const matchedTerms = terms.filter(term => lower.includes(term));
        const score = pathScore(entry.path) + matchedTerms.length * 4;
        const url = `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(ref)}/${encodedPath}`;
        fetched.push({ path: entry.path, url, content, matchedTerms, score });
      } catch {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, worker));
  fetched.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const results = [];
  let budget = 18_000;
  for (const file of fetched) {
    if (results.length >= Math.min(Math.max(Number(maxFiles) || 10, 1), 15) || budget <= 0) break;
    const maxExcerpt = Math.min(2_400, budget);
    let excerpt = file.content;
    if (file.matchedTerms.length) {
      const matchAt = Math.max(0, file.content.toLowerCase().indexOf(file.matchedTerms[0]));
      const start = Math.max(0, matchAt - Math.floor(maxExcerpt / 3));
      excerpt = file.content.slice(start, start + maxExcerpt);
      if (start) excerpt = `…${excerpt}`;
      if (start + maxExcerpt < file.content.length) excerpt += '…';
    } else excerpt = excerpt.slice(0, maxExcerpt);
    results.push({ path: file.path, url: file.url, excerpt, matchedTerms: file.matchedTerms });
    budget -= excerpt.length;
  }
  return {
    repository: repository.name,
    url: repository.url,
    defaultBranch: ref,
    scannedTextFiles: fetched.length,
    availableTextFiles: entries.length,
    treeTruncated: tree.truncated === true,
    files: results
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
