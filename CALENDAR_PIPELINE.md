# Free rule-based calendar

No LLM calls, paid model or OpenAI credentials are used.
Only NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required.
Five news search requests per run; ten per scheduled day (07:35/19:35 KST).
Provider, GitHub Actions and hosting quotas still apply.

Explicit absolute date, timezone and announcement wording are required.
Relative/multiple dates and speculation are excluded. All news candidates require human review
because search snippets cannot reliably establish the organizer or schedule changes.
Review candidates and reasons persist in calendar-pipeline-review.json (outside public site).
The calendar-review artifact is available from GitHub Actions.

Put verified event objects in calendar-approved.json under events, with requiresReview=false.
Use validateCandidate-compatible fields plus article {url,text,publishedAt}; only validated approvals
are merged into the public snapshot. Stable entity/eventKind/period identities handle updates.
Cancelled approved events are retained in storage and hidden by the UI.
Existing official schedules stay untouched. No tests or raw candidates are published.

CALENDAR_PIPELINE_ENABLED=true enables scheduled runs after the manual smoke test.
Tests: node --test calendar-pipeline.test.mjs calendar-model.test.mjs calendar-macro.test.mjs calendar-market-events.test.mjs
Storage is version-controlled JSON, not a relational database.
