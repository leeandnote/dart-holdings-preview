# VPS migration plan

## Goal

Move from temporary GitHub Pages hosting to a VPS that can:

- Serve the dashboard publicly
- Run DART and price updates automatically
- Keep users reading cached local files, not live DART API calls
- Later connect a custom domain and HTTPS

## First decision

Buy or prepare a VPS with:

- Ubuntu 24.04 LTS
- 2 GB RAM minimum
- 40 GB disk minimum
- SSH access

## Deployment structure

```text
/opt/dart-holdings
  daily_update.ps1
  major_holdings.ps1
  enrich_obligation_dates.ps1
  update_prices.ps1
  site/
  deploy/vps/
```

## Daily operation

The server timer runs:

- 16:40 KST
- 23:40 KST

Manual update:

```bash
sudo systemctl start dart-holdings-update.service
```

Check logs:

```bash
sudo journalctl -u dart-holdings-update.service -n 200
```

## Domain later

After buying a domain:

1. Point DNS A record to the VPS IP.
2. Update Nginx `server_name`.
3. Install HTTPS with Certbot.
4. Update `robots.txt`, `sitemap.xml`, Search Console, and AdSense.

