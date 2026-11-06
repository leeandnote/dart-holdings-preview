# News calendar pipeline

## Configuration

GitHub Actions secrets: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `OPENAI_API_KEY`.
Repository variable: `CALENDAR_EXTRACTION_MODEL` (a Responses API model supporting strict JSON schema).
Set `CALENDAR_PIPELINE_ENABLED=true` only after a successful manual run to enable scheduled updates.
No model is silently selected; missing configuration fails before fetching news.
API billing is separate from the Codex subscription. At most 25 new article snippets per run are extracted.

`calendar-update.yml` runs at 07:35 and 19:35 KST and supports manual dispatch.
It persists a versioned JSON snapshot and fingerprints in Git, then dispatches site deployment.
This is a file-backed store, not a relational database. Scheduled runs are serialized.
Push/rebase conflicts fail rather than overwrite a newer snapshot. Rerun after resolving conflicts.

## Evidence boundary

The fetcher uses the official NAVER API HUB news search, not arbitrary publisher crawling.
Only supplied titles and snippets are sent to the extraction model. Full articles and DART documents
are not fetched in this version. Missing details are never reconstructed from model knowledge.
Explicit year/month/day and timezone evidence are mandatory. Relative dates and cross-timezone
time conversions are held for review. Exact KST times are accepted only when present verbatim.
Review artifact contains URLs and rejection reasons, not a bulk copy of article text.
News-derived dates are not independently confirmed official schedules.

Public JSON contains a short supporting excerpt, original URL, source publication date, extraction
update timestamp, category, importance, sectors and explicitly mentioned stock codes.
Same entity/event-kind/edition keys update dates rather than duplicate rescheduled events.
Cancellation removes the event from UI, retaining it in storage. Different identity wording can
still require manual reconciliation. Existing curated official events remain separate.

## Verification

`node --test calendar-pipeline.test.mjs calendar-model.test.mjs calendar-macro.test.mjs calendar-market-events.test.mjs`

Tests use three synthetic articles and mocked LLM responses; they test parser/validation/adapter,
not live LLM accuracy. Do not publish these fixtures as real announcements.
