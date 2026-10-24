/**
 * Persist AquaNest store.json to a private GitHub file so Render restarts
 * do not wipe users/orders (Firestore is optional and currently disabled).
 *
 * Render env:
 *   DURABLE_GITHUB_TOKEN=ghp_...   (repo contents:read/write on aquanest-backend)
 * Optional:
 *   DURABLE_GITHUB_REPO=Aarthy63/aquanest-backend
 *   DURABLE_GITHUB_PATH=data/durable-store.json
 *   DURABLE_GITHUB_BRANCH=durable-data
 */

function cfg() {
  const token = String(process.env.DURABLE_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  const repo = String(process.env.DURABLE_GITHUB_REPO || "Aarthy63/aquanest-backend").trim();
  const path = String(process.env.DURABLE_GITHUB_PATH || "data/durable-store.json").trim();
  const branch = String(process.env.DURABLE_GITHUB_BRANCH || "durable-data").trim();
  return { token, repo, path, branch, enabled: !!token };
}

export function durableGithubEnabled() {
  return cfg().enabled;
}

async function gh(pathname, { method = "GET", body } = {}) {
  const { token } = cfg();
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AquaNest-DurableStore",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(json?.message || `GitHub ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function ensureBranch() {
  const { repo, branch } = cfg();
  try {
    await gh(`/repos/${repo}/git/ref/heads/${branch}`);
    return;
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  // Create branch from main/master
  let baseSha;
  try {
    const main = await gh(`/repos/${repo}/git/ref/heads/main`);
    baseSha = main.object.sha;
  } catch {
    const master = await gh(`/repos/${repo}/git/ref/heads/master`);
    baseSha = master.object.sha;
  }
  await gh(`/repos/${repo}/git/refs`, {
    method: "POST",
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  });
}

export async function loadDurableGithub() {
  if (!durableGithubEnabled()) return null;
  const { repo, path, branch } = cfg();
  await ensureBranch();
  try {
    const file = await gh(
      `/repos/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`,
    );
    const decoded = Buffer.from(file.content.replace(/\n/g, ""), "base64").toString("utf8");
    const data = JSON.parse(decoded);
    return { data, sha: file.sha };
  } catch (err) {
    if (err.status === 404) return { data: null, sha: null };
    throw err;
  }
}

export async function saveDurableGithub(payload, sha) {
  if (!durableGithubEnabled()) return { ok: false, reason: "off" };
  const { repo, path, branch } = cfg();
  await ensureBranch();
  const content = Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64");
  const body = {
    message: `chore(db): durable store sync ${new Date().toISOString()}`,
    content,
    branch,
  };
  if (sha) body.sha = sha;
  const result = await gh(`/repos/${repo}/contents/${path}`, { method: "PUT", body });
  return { ok: true, sha: result.content?.sha || null };
}
