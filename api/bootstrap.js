import { supabaseGet } from "./_supabase.js";

const CACHE_KEYS = [
  "latest",
  "logos",
  "event_prices",
  "current_prices",
  "shareholders",
  "disclosure_signals",
];

export default async function handler(req, res) {
  try {
    const keys = CACHE_KEYS.map((key) => `"${key}"`).join(",");
    const rows = await supabaseGet(`site_cache?key=in.(${keys})&select=key,payload`);
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row.payload]));
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    res.status(200).json({
      latest: byKey.latest || null,
      logos: byKey.logos || {},
      eventPrices: byKey.event_prices || {},
      currentPrices: byKey.current_prices || {},
      shareholders: byKey.shareholders || {},
      disclosureSignals: byKey.disclosure_signals || { rows: [] },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
