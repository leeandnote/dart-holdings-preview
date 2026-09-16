const PRIMARY_CRON = "10 11 * * *";
const BACKUP_CRON = "30 11 * * *";
const INTRADAY_CRONS = [
  "*/10 22-23 * * SUN-THU", // KST weekdays 07:00-08:50
  "*/10 0-10 * * MON-FRI", // KST weekdays 09:00-19:50
  "0 11 * * MON-FRI",      // KST weekdays 20:00
];

function kstReportDate(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp)).replaceAll("-", "");
}

function githubHeaders(env) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "leeandnote-cloudflare-scheduler",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function dispatchPublish(env, reportDate) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: { ...githubHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: env.GITHUB_REF,
      inputs: {
        report_date: reportDate,
        send_telegram: "true",
        post_x: "true",
        post_threads: "true",
        post_instagram: "true",
        post_youtube: "true",
        render_youtube_only: "false",
      },
    }),
  });
  if (response.status !== 204) {
    throw new Error(`GitHub dispatch failed: HTTP ${response.status} ${await response.text()}`);
  }
  return { action: "dispatched", reportDate };
}

async function dispatchIntraday(env) {
  const workflow = env.GITHUB_INTRADAY_WORKFLOW || "intraday-alert.yml";
  const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: { ...githubHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: env.GITHUB_REF }),
  });
  if (response.status !== 204) {
    throw new Error(`GitHub intraday dispatch failed: HTTP ${response.status} ${await response.text()}`);
  }
  return { action: "intraday-dispatched", reportDate: kstReportDate(Date.now()) };
}

async function recentPublishRuns(env, timestamp) {
  const url = new URL(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${env.GITHUB_WORKFLOW}/runs`);
  url.searchParams.set("event", "workflow_dispatch");
  url.searchParams.set("branch", env.GITHUB_REF);
  url.searchParams.set("per_page", "20");
  const response = await fetch(url, { headers: githubHeaders(env) });
  if (!response.ok) throw new Error(`GitHub run lookup failed: HTTP ${response.status} ${await response.text()}`);
  const body = await response.json();
  const windowStart = timestamp - 25 * 60 * 1000;
  return (body.workflow_runs || []).filter((run) => Date.parse(run.created_at) >= windowStart);
}

async function backupPublish(env, timestamp, reportDate) {
  const runs = await recentPublishRuns(env, timestamp);
  const active = runs.find((run) => run.status === "queued" || run.status === "in_progress");
  if (active) return { action: "skipped-active", reportDate, runId: active.id };
  const successful = runs.find((run) => run.status === "completed" && run.conclusion === "success");
  if (successful) return { action: "skipped-success", reportDate, runId: successful.id };
  return dispatchPublish(env, reportDate);
}

async function handleScheduled(controller, env) {
  if (!env.GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN secret.");
  const reportDate = kstReportDate(controller.scheduledTime);
  if (controller.cron === PRIMARY_CRON) return dispatchPublish(env, reportDate);
  if (controller.cron === BACKUP_CRON) return backupPublish(env, controller.scheduledTime, reportDate);
  if (INTRADAY_CRONS.includes(controller.cron)) return dispatchIntraday(env);
  return { action: "ignored", cron: controller.cron, reportDate };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(controller, env).then(console.log).catch((error) => {
      console.error(error);
      throw error;
    }));
  },

  async fetch() {
    return Response.json({
      ok: true,
      scheduler: "leeandnote-publish-scheduler",
      primary: PRIMARY_CRON,
      backup: BACKUP_CRON,
      intraday: INTRADAY_CRONS,
    });
  },
};
