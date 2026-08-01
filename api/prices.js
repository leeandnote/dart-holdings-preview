import { supabaseGet } from "./_supabase.js";

export default async function handler(req, res) {
  try {
    const stockCode = String(req.query.stockCode || "").replace(/[^0-9]/g, "").slice(0, 6);
    if (!stockCode) {
      res.status(400).json({ error: "stockCode가 필요합니다." });
      return;
    }
    const rows = await supabaseGet(`price_candles?stock_code=eq.${stockCode}&select=payload&limit=1`);
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=86400");
    res.status(200).json({ stockCode, candles: rows[0]?.payload || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
