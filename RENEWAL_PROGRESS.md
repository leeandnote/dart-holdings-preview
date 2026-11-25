# Renewal v2 progress

## Phase 1: common chrome, first checkpoint

- Added supplied light/dark wordmarks, avatar and full character (name: 리앤노트).
- Added Alata Regular and original OFL license. Korean typography remains separate.
- Added announcement dismissal with seven-day local persistence and blocked-storage fallback.
- Added black navigation, responsive category tabs and mobile menu expansion.
- Added desktop channel rail and five-item mobile bar with Telegram in the middle.
- Added native modal search and social sheet; search currently targets the existing 5% report search, not a claimed unified search.
- Added shared footer. Article source footers are retained.
- Applied visual transformation after sitemap/RSS generation and fail the build if protected SEO tags differ.

Validation: five page fixtures preserve title/meta/canonical/alternate/JSON-LD, plus legacy channel test. Four pages at 1280px and 375px have before/after screenshots under artifacts/renewal-phase1. No page-level horizontal overflow, logos load, search/SNS dialogs and persistent banner dismissal pass browser checks.

Not yet completed: reference-site visual comparison, outlined SVG wordmarks, article scroll CTA, article content gates and templates, disclosurepedia retirement, manuscript verification, home/list/data redesign, deployment. Screenshots are local source previews with remote API calls blocked, not production data validation.

Next sequence: finish Phase 1 details; Phase 2 article layout and content audit; Phase 6 data-driven daily articles; verify supplied manuscript; list/home/data phases. Disclosurepedia retirement must be isolated and tested separately from the visual SEO-preserving transformation.

## Phase 2: article readability and gate foundation

- Added white article layout, 720px reading column, Alata section label, corrected visible category breadcrumbs, and narrower typography hierarchy.
- Added character avatar explicitly labeled as a character, editorial-team attribution, existing update/data date, calculated reading duration, and editorial-policy link. No invented person or credentials.
- Removed in-article category filters. Daily visible H1 drops date/category suffix, while SEO title remains unchanged.
- Summary styling requires 1,500 prose characters; short summaries remain as ordinary introductory paragraphs, preserving content.
- TOC requires four H2 headings and 3,000 prose characters, excluding tables. Desktop sidebar displayed at 1440px and above.
- One-row tables become labeled records preserving links. Identical plain-text columns collapse to a labeled note; links and spanning cells are not collapsed.
- Matching FAQ questions and answers become native details. Existing FAQ structured data remains unchanged; mismatches are reported, not silently rewritten.
- Added article-end Telegram CTA and dismissible desktop CTA after 70% of the article body is reached.
- Added `npm run content:audit` and page-level build gate logs. Current source scan: 58 article bodies.

Validation: 10 unit tests pass; all 309 source HTML pages retain protected SEO tags. Six page types at 375/1280/1440px pass no-overflow/logo/header checks; screenshots in artifacts/renewal-phase2. Updated local preview runs on port 4180 because port 4178 retains the previous version.

Remaining Phase 2 work: related/previous/next articles, verified bibliography aggregation, stock search links, full institutional gates (intentional noindex changes), chart components, and production-build integration verification. No production deployment yet. Other renewal phases remain pending.
