# Opening checklist

## 1. GitHub repository settings

1. Upload this project to the GitHub repository.
2. Go to Settings > Secrets and variables > Actions > New repository secret.
3. Add secret name `DART_API_KEY`.
4. Put your DART API key as the secret value.
5. Go to Settings > Pages.
6. Set Source to `GitHub Actions`.
7. Open Actions > Daily DART data update > Run workflow.

## 2. Optional site URL variable

If you connect a custom domain later:

1. Go to Settings > Secrets and variables > Actions > Variables.
2. Add variable name `SITE_URL`.
3. Put the full site URL, for example `https://example.com/`.

The workflow uses this URL to generate `robots.txt` and `sitemap.xml`.

## 3. Files to check before launch

- `site/ads.txt`
- `site/privacy.html`
- `site/terms.html`
- `site/disclaimer.html`
- `site/contact.html`
- `.github/workflows/daily-update.yml`

## 4. Replace before public promotion

- Replace `your-email@example.com` in `site/contact.html`.
- Replace `https://YOUR_DOMAIN_HERE/` in `site/sitemap.xml` if deploying manually without GitHub Actions.
- Register the final URL in Google Search Console.
- Submit `sitemap.xml` in Google Search Console.
