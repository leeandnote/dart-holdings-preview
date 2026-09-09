import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const CARD_SECONDS = 9;
const FPS = 30;

function requireValue(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is missing.`);
  return value;
}

export function renderYouTubeShort(cards, outputPath) {
  if (cards.length < 2) throw new Error("YouTube Short rendering requires at least two cards.");
  const selected = cards.slice(0, 3);
  const args = ["-y"];
  for (const card of selected) {
    args.push("-loop", "1", "-t", String(CARD_SECONDS), "-i", card.file);
  }

  const frames = CARD_SECONDS * FPS;
  const filters = selected.map((_, index) =>
    `[${index}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},` +
    `zoompan=z='min(zoom+0.00012,1.022)':d=${frames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${FPS},` +
    `fade=t=in:st=0:d=0.3,fade=t=out:st=${CARD_SECONDS - 0.3}:d=0.3,` +
    `setsar=1[v${index}]`
  );
  const concatInputs = selected.map((_, index) => `[v${index}]`).join("");
  filters.push(`${concatInputs}concat=n=${selected.length}:v=1:a=0,format=yuv420p[v]`);

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[v]",
    "-an",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-movflags", "+faststart",
    "-r", String(FPS),
    outputPath,
  );
  const result = spawnSync(process.env.FFMPEG_PATH || "ffmpeg", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`YouTube Short rendering failed: ${result.stderr || result.stdout}`);
  }
  return outputPath;
}

async function youtubeAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireValue("YOUTUBE_CLIENT_ID"),
      client_secret: requireValue("YOUTUBE_CLIENT_SECRET"),
      refresh_token: requireValue("YOUTUBE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`YouTube token refresh failed: ${body.error_description || body.error || response.status}`);
  }
  return body.access_token;
}

export async function uploadYouTubeShort({ file, title, description, tags = [] }) {
  const accessToken = await youtubeAccessToken();
  const privacyStatus = String(process.env.YOUTUBE_PRIVACY_STATUS || "private").toLowerCase();
  if (!["private", "unlisted", "public"].includes(privacyStatus)) {
    throw new Error(`Invalid YOUTUBE_PRIVACY_STATUS: ${privacyStatus}`);
  }
  const metadata = {
    snippet: {
      title: title.slice(0, 100),
      description: description.slice(0, 5000),
      tags: tags.slice(0, 30),
      categoryId: "25",
      defaultLanguage: "ko",
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
  };
  const video = await readFile(file);
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-length": String(video.length),
      "x-upload-content-type": "video/mp4",
    },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) {
    const body = await start.text();
    throw new Error(`YouTube upload session failed: HTTP ${start.status} ${body}`);
  }
  const uploadUrl = start.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube upload session did not return a location.");

  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-length": String(video.length),
      "content-type": "video/mp4",
    },
    body: video,
  });
  const body = await upload.json().catch(() => ({}));
  if (!upload.ok || !body.id) {
    throw new Error(`YouTube upload failed: HTTP ${upload.status} ${JSON.stringify(body)}`);
  }
  return {
    videoId: String(body.id),
    privacyStatus,
    url: `https://www.youtube.com/shorts/${body.id}`,
    fileName: path.basename(file),
  };
}
