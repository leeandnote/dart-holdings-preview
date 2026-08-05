const OWNER = process.env.GITHUB_OWNER || "leeandnote";
const REPO = process.env.GITHUB_REPO || "dart-holdings-preview";
const WORKFLOW = process.env.GITHUB_WORKFLOW || "daily-update.yml";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const DEDUPE_MINUTES = Number(process.env.INTRADAY_CRON_DEDUPE_MINUTES || 20);

function json(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

function optionalCronSecretMatches(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

async function github(path, options = {}) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    throw new Error("Missing Vercel environment variable: GITHUB_DISPATCH_TOKEN");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "leeandnote-vercel-cron",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function hasRecentIntradayRun() {
  const runs = await github(
    `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=20`
  );
  const since = Date.now() - DEDUPE_MINUTES * 60 * 1000;
  return (runs.workflow_runs || []).some((run) => {
    const createdAt = new Date(run.created_at).getTime();
    return createdAt >= since && ["queued", "in_progress"].includes(run.status);
  });
}

async function dispatchWorkflow() {
  await github(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: BRANCH, inputs: { mode: "intraday" } }),
  });
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  if (!optionalCronSecretMatches(req)) {
    return json(res, 401, { ok: false, error: "Invalid cron secret" });
  }

  try {
    if (await hasRecentIntradayRun()) {
      return json(res, 200, {
        ok: true,
        skipped: true,
        reason: `Recent intraday run exists within ${DEDUPE_MINUTES} minutes.`,
      });
    }

    await dispatchWorkflow();
    return json(res, 200, {
      ok: true,
      dispatched: true,
      workflow: WORKFLOW,
      ref: BRANCH,
      mode: "intraday",
      schedule: "KST 09:05-17:35 weekdays via Vercel Cron text alert",
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      error: error.message,
    });
  }
};
