param(
  [string]$ReportDate = "",
  [int]$PriceDays = 120,
  [int]$PublishDays = 90,
  [int]$BackfillDays = 7,
  [switch]$SkipDeploy,
  [switch]$SendSocialCards,
  [switch]$PostXCards,
  [switch]$PostThreadsCards,
  [switch]$PostInstagramCards,
  [switch]$PostYouTubeShort,
  [switch]$AllowWarnings
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$dartConfig = Join-Path $root "dart_config.local.ps1"
if (Test-Path -LiteralPath $dartConfig) { . $dartConfig }

$userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$bundledNode = Join-Path $userHome ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$bundledPnpm = Join-Path $userHome ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

if (Test-Path -LiteralPath $bundledNode) {
  $node = $bundledNode
  $nodeDir = Split-Path -Parent $node
  $env:Path = "$nodeDir;$env:Path"
} else {
  $node = "node"
}

if (Test-Path -LiteralPath $bundledPnpm) {
  $pnpm = $bundledPnpm
} else {
  $pnpm = "pnpm"
}

try {
  & $node --version | Out-Null
} catch {
  throw "Node.js not found. Install Node.js or use the bundled Codex runtime."
}

if (-not $ReportDate) {
  $kstNow = [DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(9))
  $ReportDate = $kstNow.ToString("yyyyMMdd")
}

function Invoke-Step([string]$Title, [scriptblock]$Action) {
  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
  & $Action
}

function Read-HealthReport {
  $reportPath = Join-Path $root "site\reports\site_health_report.json"
  if (-not (Test-Path -LiteralPath $reportPath)) {
    throw "Health report was not generated: $reportPath"
  }
  return Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

Invoke-Step "1. Convex price gap repair" {
  & $node (Join-Path $root "repair_convex_price_gaps.mjs") --days $PriceDays
}

Invoke-Step "1b. Sync Convex holdings fallback" {
  & $node (Join-Path $root "sync_convex_holdings_fallback.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Convex holdings fallback sync failed" }
}



Invoke-Step "2. Refresh contract disclosure signals" {
  if ([string]::IsNullOrWhiteSpace($env:DART_API_KEY)) {
    Write-Host "DART_API_KEY missing. Contract disclosure refresh skipped." -ForegroundColor Yellow
  } else {
    $shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }
    & $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "disclosure_signals.ps1") -BgnDe ([datetime]::ParseExact($ReportDate, "yyyyMMdd", $null).AddDays(-7).ToString("yyyyMMdd")) -EndDe $ReportDate -ApiKey $env:DART_API_KEY -MaxSearchPages 20 -MaxCandidates 260 -MaxDocuments 80 -JsonOut (Join-Path $root "site\data\disclosure_signals.json")
    if ($LASTEXITCODE -ne 0) { throw "Contract disclosure signal refresh failed for $ReportDate" }
    & $node (Join-Path $root "sync_convex_price_targets.mjs") --days 30
    if ($LASTEXITCODE -ne 0) { throw "Price target sync failed" }
    & $node (Join-Path $root "update_naver_current_prices.mjs") --concurrency 24
    if ($LASTEXITCODE -ne 0) { throw "Naver current price update failed" }
  }
}

Invoke-Step "3. Generate daily blog pages with backfill" {
  $targetDate = [datetime]::ParseExact($ReportDate, "yyyyMMdd", $null)
  for ($i = 0; $i -lt $BackfillDays; $i++) {
    $dateText = $targetDate.AddDays(-$i).ToString("yyyyMMdd")
    Write-Host "Generating blog pages for $dateText"
    & $node (Join-Path $root "generate_daily_blog.mjs") $dateText
    if ($LASTEXITCODE -ne 0) {
      throw "Blog generation failed for $dateText"
    }
  }
}

Invoke-Step "4. Build Cloudflare Pages output" {
  & $node (Join-Path $root "prepare_cloudflare_pages.mjs") --days=$PublishDays
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare Pages build failed" }
}

Invoke-Step "5. Site data health check" {
  & $node (Join-Path $root "site_health_check.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Site data health check failed" }
}

$health = Read-HealthReport
$errors = [int]$health.counts.errors
$warnings = [int]$health.counts.warnings

Write-Host ""
Write-Host "Health summary: errors=$errors warnings=$warnings" -ForegroundColor Yellow

if ($errors -gt 0) {
  Write-Host "Publishing stopped because blocking data errors remain." -ForegroundColor Red
  Write-Host "Check: site\reports\site_health_report.md"
  Get-Content -LiteralPath (Join-Path $root "site\reports\site_health_report.md") -Encoding UTF8
  exit 1
}

if ($warnings -gt 0) {
  Write-Host "Warnings remain; publishing continues because blocking errors are zero." -ForegroundColor Yellow
  Write-Host "Check: site\reports\site_health_report.md"
}

if ($SkipDeploy) {
  Write-Host "SkipDeploy enabled. Build completed but Cloudflare deployment was skipped."
  exit 0
}

try {
  & $pnpm --version | Out-Null
} catch {
  throw "pnpm not found. Install pnpm or use the bundled Codex runtime."
}

Invoke-Step "6. Deploy to Cloudflare Pages" {
  & $pnpm dlx wrangler pages deploy (Join-Path $root "public_dist") --project-name leeandnote --branch main
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare Pages deploy failed" }
}

if ($SendSocialCards) {
  Invoke-Step "7. Send Telegram social summary cards" {
    $env:LEEANDNOTE_PNPM = $pnpm
    $socialArgs = @($ReportDate)
    if ($PostXCards) {
      $socialArgs += "--x"
    }
    if ($PostThreadsCards) {
      $socialArgs += "--threads"
    }
    if ($PostInstagramCards) {
      $socialArgs += "--instagram"
    }
    if ($PostYouTubeShort) {
      $socialArgs += "--youtube"
    }
    & $node (Join-Path $root "send_daily_social_cards.mjs") @socialArgs
    if ($LASTEXITCODE -ne 0) {
      throw "Social summary card send/post failed for $ReportDate"
    }
  }
}

Write-Host ""
Write-Host "Skip Telegram contracts text summary by request. Social summary cards remain enabled when requested." -ForegroundColor DarkGray

Write-Host ""
Write-Host "Daily checked blog publish complete." -ForegroundColor Green





