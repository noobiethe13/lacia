/**
 * Multi-Git Provider Support
 * Supports GitHub, GitLab, and Bitbucket for PR/MR creation
 * Auto-detects provider from repository URL
 */

export type GitProvider = "github" | "gitlab" | "bitbucket" | "unknown";

export interface PullRequestResult {
  url: string;
  id: number | string;
  provider: GitProvider;
}

export interface RepoInfo {
  provider: GitProvider;
  owner: string;
  repo: string;
  apiBase: string;
  defaultBranch?: string; // Will be populated by getDefaultBranch
}

/**
 * Detect git provider from repository URL
 */
export function detectProvider(repoUrl: string): GitProvider {
  const url = repoUrl.toLowerCase();
  if (url.includes("github.com")) return "github";
  if (url.includes("gitlab.com")) return "gitlab";
  if (url.includes("bitbucket.org")) return "bitbucket";
  return "unknown";
}

/**
 * Parse repository URL to extract owner, repo, and API base
 */
export function parseRepoUrl(repoUrl: string): RepoInfo {
  const provider = detectProvider(repoUrl);
  
  // Extract owner/repo from URL patterns like:
  // https://github.com/owner/repo.git
  // https://gitlab.com/owner/repo
  // https://bitbucket.org/workspace/repo
  const match = repoUrl.match(/(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/([^/]+)\/([^/.]+)/);
  
  if (!match) {
    return { provider: "unknown", owner: "", repo: "", apiBase: "" };
  }

  const [, owner, repo] = match;

  const apiBase = {
    github: "https://api.github.com",
    gitlab: "https://gitlab.com/api/v4",
    bitbucket: "https://api.bitbucket.org/2.0",
    unknown: "",
  }[provider];

  return { provider, owner, repo, apiBase };
}

/**
 * Get the default branch of a repository
 */
export async function getDefaultBranch(repoInfo: RepoInfo, token: string): Promise<string> {
  const { provider, owner, repo, apiBase } = repoInfo;
  
  console.log(`[Git] Fetching default branch for ${owner}/${repo}...`);
  
  try {
    switch (provider) {
      case "github": {
        const res = await fetch(`${apiBase}/repos/${owner}/${repo}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[Git] Default branch: ${data.default_branch}`);
          return data.default_branch || "main";
        }
        break;
      }
      case "gitlab": {
        const projectPath = encodeURIComponent(`${owner}/${repo}`);
        const res = await fetch(`${apiBase}/projects/${projectPath}`, {
          headers: { "PRIVATE-TOKEN": token },
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[Git] Default branch: ${data.default_branch}`);
          return data.default_branch || "main";
        }
        break;
      }
      case "bitbucket": {
        const res = await fetch(`${apiBase}/repositories/${owner}/${repo}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[Git] Default branch: ${data.mainbranch?.name}`);
          return data.mainbranch?.name || "main";
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[Git] Failed to fetch default branch: ${err}`);
  }
  
  // Fallback
  console.log(`[Git] Using fallback default branch: main`);
  return "main";
}


/**
 * Get authenticated clone URL with token
 * Uses x-access-token format for GitHub which works with both classic and fine-grained PATs
 */
export function getAuthenticatedCloneUrl(repoUrl: string, token?: string): string {
  if (!token) return repoUrl;
  
  const provider = detectProvider(repoUrl);
  
  switch (provider) {
    case "github":
      // Use x-access-token format - works for both classic and fine-grained PATs
      return repoUrl.replace("https://github.com", `https://x-access-token:${token}@github.com`);
    case "gitlab":
      return repoUrl.replace("https://gitlab.com", `https://oauth2:${token}@gitlab.com`);
    case "bitbucket":
      // Bitbucket uses x-token-auth for app passwords
      return repoUrl.replace("https://bitbucket.org", `https://x-token-auth:${token}@bitbucket.org`);
    default:
      return repoUrl;
  }
}

/**
 * Create a Pull Request or Merge Request based on provider
 */
export async function createPullRequest(
  repoInfo: RepoInfo,
  token: string,
  params: {
    title: string;
    body: string;
    sourceBranch: string;
    targetBranch: string;
  }
): Promise<PullRequestResult> {
  const { provider, owner, repo, apiBase } = repoInfo;

  console.log(`[Git] Creating PR for ${provider}: ${owner}/${repo}`);
  console.log(`[Git] Source branch: ${params.sourceBranch} -> Target: ${params.targetBranch}`);
  console.log(`[Git] API base: ${apiBase}`);
  console.log(`[Git] Token present: ${token ? "yes (length: " + token.length + ")" : "NO"}`);

  switch (provider) {
    case "github":
      return createGitHubPR(apiBase, token, owner, repo, params);
    case "gitlab":
      return createGitLabMR(apiBase, token, owner, repo, params);
    case "bitbucket":
      return createBitbucketPR(apiBase, token, owner, repo, params);
    default:
      throw new Error(`Unsupported git provider: ${provider}`);
  }
}

async function createGitHubPR(
  apiBase: string,
  token: string,
  owner: string,
  repo: string,
  params: { title: string; body: string; sourceBranch: string; targetBranch: string }
): Promise<PullRequestResult> {
  const url = `${apiBase}/repos/${owner}/${repo}/pulls`;
  console.log(`[GitHub] POST ${url}`);
  console.log(`[GitHub] Request body: head=${params.sourceBranch}, base=${params.targetBranch}`);
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      head: params.sourceBranch,
      base: params.targetBranch,
    }),
  });

  console.log(`[GitHub] Response status: ${response.status}`);
  
  if (!response.ok) {
    const error = await response.text();
    console.error(`[GitHub] PR creation failed: ${response.status}`);
    console.error(`[GitHub] Error response: ${error}`);
    throw new Error(`GitHub PR creation failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  console.log(`[GitHub] PR created successfully: ${data.html_url}`);
  return {
    url: data.html_url,
    id: data.number,
    provider: "github",
  };
}

async function createGitLabMR(
  apiBase: string,
  token: string,
  owner: string,
  repo: string,
  params: { title: string; body: string; sourceBranch: string; targetBranch: string }
): Promise<PullRequestResult> {
  // GitLab uses URL-encoded project path
  const projectPath = encodeURIComponent(`${owner}/${repo}`);
  
  const response = await fetch(`${apiBase}/projects/${projectPath}/merge_requests`, {
    method: "POST",
    headers: {
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      description: params.body,
      source_branch: params.sourceBranch,
      target_branch: params.targetBranch,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitLab MR creation failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    url: data.web_url,
    id: data.iid,
    provider: "gitlab",
  };
}

async function createBitbucketPR(
  apiBase: string,
  token: string,
  owner: string,
  repo: string,
  params: { title: string; body: string; sourceBranch: string; targetBranch: string }
): Promise<PullRequestResult> {
  const response = await fetch(`${apiBase}/repositories/${owner}/${repo}/pullrequests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      description: params.body,
      source: { branch: { name: params.sourceBranch } },
      destination: { branch: { name: params.targetBranch } },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bitbucket PR creation failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    url: data.links.html.href,
    id: data.id,
    provider: "bitbucket",
  };
}
