export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (expected && provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.status(501).json({
    status: "collector-not-ported-yet",
    message:
      "Vercel Cron endpoint is ready. Next step is porting the DART collector from PowerShell to Node/Python serverless, then writing results to Supabase.",
  });
}
