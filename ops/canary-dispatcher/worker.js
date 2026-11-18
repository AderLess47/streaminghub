// Hourly fallback for the staging billing canary.
//
// GitHub's own cron delivered no run at all for a whole day (2026-11-18), and no
// workflow can start itself. This Worker looks at the last canary run and starts
// one through the API when it is older than MAX_AGE_MS. It only starts a run: the
// issue, the closing comment and the heartbeat are produced by the workflow,
// because the dispatch carries source=external and the workflow therefore treats
// it like an unattended run instead of a manual one.

const OWNER = "AderLess47";
const REPO = "streaminghub";
const WORKFLOW_FILE = ".github/workflows/staging-canary.yml";
const WORKFLOW_ID = "staging-canary.yml";
const MAX_AGE_MS = 22 * 60 * 60 * 1000;

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(check(env));
  },

  async fetch(_request, env) {
    return Response.json(await check(env));
  },
};

async function check(env) {
  const token = env.GH_TOKEN;
  if (!token) {
    return { action: "skipped", reason: "GH_TOKEN is not configured" };
  }

  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "staging-canary-dispatcher",
    "x-github-api-version": "2022-11-28",
  };
  const api = `https://api.github.com/repos/${OWNER}/${REPO}/actions`;

  const listRes = await fetch(`${api}/runs?per_page=20`, { headers });
  if (!listRes.ok) {
    return { action: "error", step: "list runs", status: listRes.status };
  }

  const { workflow_runs: runs = [] } = await listRes.json();
  const latest = runs
    .filter((run) => run.path === WORKFLOW_FILE)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const now = Date.now();

  if (latest && now - Date.parse(latest.created_at) < MAX_AGE_MS) {
    return { action: "none", lastRun: latest.created_at, runId: latest.id };
  }

  const dispatchRes = await fetch(`${api}/workflows/${WORKFLOW_ID}/dispatches`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { source: "external" } }),
  });

  if (dispatchRes.status !== 204) {
    return { action: "error", step: "dispatch", status: dispatchRes.status };
  }
  return { action: "dispatched", lastRun: latest ? latest.created_at : null };
}
