import http from "node:http";
import crypto from "node:crypto";

const clientId = String(process.env.YOUTUBE_CLIENT_ID || "").trim();
const clientSecret = String(process.env.YOUTUBE_CLIENT_SECRET || "").trim();
const port = Number(process.env.YOUTUBE_OAUTH_PORT || 53682);
const redirectUri = `http://127.0.0.1:${port}/oauth2/callback`;
const state = crypto.randomBytes(24).toString("hex");

if (!clientId || !clientSecret) {
  throw new Error("YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required.");
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/youtube.upload",
  access_type: "offline",
  prompt: "consent",
  state,
}).toString();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", redirectUri);
  if (url.pathname !== "/oauth2/callback") {
    response.writeHead(404).end("Not found");
    return;
  }
  if (url.searchParams.get("state") !== state) {
    response.writeHead(400).end("Invalid OAuth state");
    server.close();
    return;
  }
  const code = url.searchParams.get("code");
  if (!code) {
    response.writeHead(400).end(`OAuth failed: ${url.searchParams.get("error") || "missing code"}`);
    server.close();
    return;
  }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.refresh_token) {
      throw new Error(token.error_description || token.error || `HTTP ${tokenResponse.status}`);
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><meta charset=utf-8><title>LEE&NOTE YouTube OAuth</title><h1>인증이 완료되었습니다.</h1><p>이 창을 닫아도 됩니다.</p>");
    console.log(JSON.stringify({ refreshToken: token.refresh_token }));
  } catch (error) {
    response.writeHead(500).end("Token exchange failed");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AUTH_URL=${authUrl}`);
});

setTimeout(() => {
  console.error("OAuth authorization timed out.");
  server.close();
  process.exitCode = 1;
}, 10 * 60 * 1000).unref();
