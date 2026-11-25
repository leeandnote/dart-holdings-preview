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
