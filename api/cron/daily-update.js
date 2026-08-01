export default async function handler(req, res) {
  res.status(200).json({
    status: "handled-by-github-actions",
    message:
      "Daily DART collection runs in GitHub Actions, then syncs the cache to Supabase. Vercel serves the dashboard and reads Supabase.",
  });
}
