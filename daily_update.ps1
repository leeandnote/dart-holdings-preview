param(
  [string]$ApiKey = $env:DART_API_KEY,
  [string]$BgnDe = (Get-Date).AddMonths(-3).ToString('yyyyMMdd'),
  [string]$EndDe = (Get-Date).ToString('yyyyMMdd'),
  [string]$PriceRange = "1y",
  [int]$PriceSleepMs = 120
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not $ApiKey) {
  throw "DART API key is missing. Pass -ApiKey or set `$env:DART_API_KEY."
}

$env:DART_API_KEY = $ApiKey

Write-Host "DART holdings update: $BgnDe ~ $EndDe"
& (Join-Path $root "major_holdings.ps1") -BgnDe $BgnDe -EndDe $EndDe -ApiKey $ApiKey

Write-Host "DART obligation-date enrichment"
& (Join-Path $root "enrich_obligation_dates.ps1") -ApiKey $ApiKey

Write-Host "Price cache update: latest available daily close"
& (Join-Path $root "update_prices.ps1") -Range $PriceRange -Interval "1d" -SleepMs $PriceSleepMs

Write-Host "Daily update complete."
Write-Host "Important: current close is based on the latest available price cache date, independent of receipt-date filters."
