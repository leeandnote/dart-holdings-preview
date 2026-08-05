param(
  [string]$ApiKey = $env:DART_API_KEY,
  [string]$BgnDe = "",
  [string]$HistoryBgnDe = (Get-Date).AddYears(-1).ToString('yyyyMMdd'),
  [string]$EndDe = (Get-Date).ToString('yyyyMMdd'),
  [string]$DisclosureBgnDe = (Get-Date).AddMonths(-6).ToString('yyyyMMdd'),
  [string]$PriceRange = "1y",
  [int]$PriceSleepMs = 120,
  [int]$RefreshLookbackDays = 0,
  [int]$ObligationMaxRows = 80,
  [int]$PriceRecentDays = 30,
  [switch]$FullRefresh,
  [switch]$RefreshDisclosureSignals,
  [switch]$RefreshShareholders,
  [switch]$RefreshLogos,
  [switch]$SendTelegram,
  [switch]$SkipTelegram
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$telegramConfig = Join-Path $root "telegram_config.local.ps1"
if (Test-Path -LiteralPath $telegramConfig) {
  . $telegramConfig
}

if (-not $ApiKey) {
  throw "DART API key is missing. Pass -ApiKey or set `$env:DART_API_KEY."
}

$env:DART_API_KEY = $ApiKey

function Normalize-UpdateDate([string]$Value) {
  return ([string]$Value).Replace("-", "").Trim()
}

function Get-KstNowString() {
  try {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById("Korea Standard Time")
  } catch {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById("Asia/Seoul")
  }
  return [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).ToString("yyyy-MM-dd HH:mm:ss")
}

function Split-DateRangeForDartList([string]$Bgn, [string]$End) {
  $start = [datetime]::ParseExact((Normalize-UpdateDate $Bgn), "yyyyMMdd", $null)
  $final = [datetime]::ParseExact((Normalize-UpdateDate $End), "yyyyMMdd", $null)
  $ranges = @()
  $cursor = $start
  while ($cursor -le $final) {
    $chunkEnd = $cursor.AddMonths(3).AddDays(-1)
    if ($chunkEnd -gt $final) { $chunkEnd = $final }
    $ranges += [pscustomobject]@{
      Bgn = $cursor.ToString("yyyyMMdd")
      End = $chunkEnd.ToString("yyyyMMdd")
    }
    $cursor = $chunkEnd.AddDays(1)
  }
  return @($ranges)
}

function Get-JsonPropertyValue([object]$Object, [string[]]$Names) {
  foreach ($name in $Names) {
    if ($Object -and $Object.PSObject.Properties[$name]) {
      return $Object.PSObject.Properties[$name].Value
    }
  }
  return $null
}

function Write-MergedLatestData([array]$ChunkFiles, [string]$Bgn, [string]$End) {
  $payloads = @($ChunkFiles | Where-Object { Test-Path -LiteralPath $_ } | ForEach-Object {
    Get-Content -LiteralPath $_ -Raw -Encoding UTF8 | ConvertFrom-Json
  })
  $rowsByReceipt = @{}
  $corpsByCode = @{}
  foreach ($payload in $payloads) {
    foreach ($corp in @($payload.corps)) {
      if ($corp.stockCode -and -not $corpsByCode.ContainsKey([string]$corp.stockCode)) {
        $corpsByCode[[string]$corp.stockCode] = $corp
      }
    }
    foreach ($row in @($payload.rows)) {
      $key = [string](Get-JsonPropertyValue $row @("접수번호"))
      if (-not $key) {
        $receiptDate = [string](Get-JsonPropertyValue $row @("접수일"))
        $stockCode = [string](Get-JsonPropertyValue $row @("종목코드"))
        $reporter = [string](Get-JsonPropertyValue $row @("보고자"))
        $currentRate = [string](Get-JsonPropertyValue $row @("이번지분율"))
        $key = "${receiptDate}_${stockCode}_${reporter}_${currentRate}"
      }
      $rowsByReceipt[$key] = $row
    }
  }
  $normalizedBgn = Normalize-UpdateDate $Bgn
  $rows = @($rowsByReceipt.Values | Where-Object {
    $receiptDate = [string](Get-JsonPropertyValue $_ @("접수일"))
    -not $receiptDate -or $receiptDate -ge $normalizedBgn
  } | Sort-Object @{ Expression = { Get-JsonPropertyValue $_ @("접수일") }; Descending = $true }, @{ Expression = { Get-JsonPropertyValue $_ @("종목명") }; Descending = $false }, @{ Expression = { Get-JsonPropertyValue $_ @("접수번호") }; Descending = $true })
  $corps = @($corpsByCode.Values | Sort-Object @{ Expression = { Get-JsonPropertyValue $_ @("name") }; Descending = $false })
  $latestJson = Join-Path $root "site\data\latest.json"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $latestJson) | Out-Null
  $payload = [pscustomobject]@{
    generatedAt = Get-KstNowString
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    scope = "KOSPI/KOSDAQ 최근 1년 전체"
    query = @()
    bgnDe = (Normalize-UpdateDate $Bgn)
    endDe = (Normalize-UpdateDate $End)
    corps = $corps
    rows = $rows
  }
  $json = $payload | ConvertTo-Json -Depth 8
  $json | Set-Content -LiteralPath $latestJson -Encoding UTF8
  "window.__DART_DATA__ = $json;" | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $latestJson) "latest.js") -Encoding UTF8
  Write-Host "Merged DART holdings cache: $($rows.Count) rows / $($corps.Count) stocks"
}

function Get-LatestReceiptDate([string]$LatestJsonPath) {
  if (-not (Test-Path -LiteralPath $LatestJsonPath)) { return "" }
  try {
    $payload = Get-Content -LiteralPath $LatestJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
    return [string](@($payload.rows | ForEach-Object { Get-JsonPropertyValue $_ @("접수일") } | Where-Object { $_ } | Sort-Object -Descending | Select-Object -First 1))
  } catch {
    return ""
  }
}

$latestJson = Join-Path $root "site\data\latest.json"
$historyBgn = Normalize-UpdateDate $HistoryBgnDe
if (-not $BgnDe) {
  if ($FullRefresh -or -not (Test-Path -LiteralPath $latestJson)) {
    $BgnDe = $historyBgn
  } else {
    $latestReceipt = Get-LatestReceiptDate -LatestJsonPath $latestJson
    if ($latestReceipt -match '^\d{8}$') {
      if ($RefreshLookbackDays -le 0) {
        $endNormalized = Normalize-UpdateDate $EndDe
        if ($latestReceipt -lt $endNormalized) {
          $startDate = [datetime]::ParseExact($latestReceipt, "yyyyMMdd", $null).AddDays(1)
          $BgnDe = $startDate.ToString("yyyyMMdd")
          Write-Host "Fast catch-up mode: checking missed receipt dates from $BgnDe to $endNormalized."
        } else {
          $BgnDe = $endNormalized
          Write-Host "Fast daily mode: checking today's receipt date ($BgnDe)."
        }
      } else {
        $startDate = [datetime]::ParseExact($latestReceipt, "yyyyMMdd", $null).AddDays(-1 * $RefreshLookbackDays)
      $historyStart = [datetime]::ParseExact($historyBgn, "yyyyMMdd", $null)
      if ($startDate -lt $historyStart) { $startDate = $historyStart }
      $BgnDe = $startDate.ToString("yyyyMMdd")
      }
    } else {
      $BgnDe = $historyBgn
    }
  }
}

Write-Host "DART holdings update: $BgnDe ~ $EndDe"
$holdingRanges = Split-DateRangeForDartList -Bgn $BgnDe -End $EndDe
$chunkDir = Join-Path $root ".cache\holding_chunks"
New-Item -ItemType Directory -Force -Path $chunkDir | Out-Null
$chunkFiles = @()
if ((Test-Path -LiteralPath $latestJson) -and -not $FullRefresh) {
  $chunkFiles += $latestJson
}
$index = 0
foreach ($range in $holdingRanges) {
  $index += 1
  $jsonOut = Join-Path $chunkDir "latest_$($range.Bgn)_$($range.End).json"
  $csvOut = Join-Path $chunkDir "major_holdings_$($range.Bgn)_$($range.End).csv"
  Write-Host "DART holdings chunk $index/$($holdingRanges.Count): $($range.Bgn) ~ $($range.End)"
  & (Join-Path $root "major_holdings.ps1") -BgnDe $range.Bgn -EndDe $range.End -ApiKey $ApiKey -JsonOut $jsonOut -Out $csvOut
  $chunkFiles += $jsonOut
}
Write-MergedLatestData -ChunkFiles $chunkFiles -Bgn $historyBgn -End $EndDe

Write-Host "DART obligation-date enrichment"
$obligationArgs = @{
  ApiKey = $ApiKey
}
if (-not $FullRefresh -and $ObligationMaxRows -gt 0) {
  $obligationArgs.MaxRows = $ObligationMaxRows
}
& (Join-Path $root "enrich_obligation_dates.ps1") @obligationArgs

if ($RefreshDisclosureSignals -or $FullRefresh) {
  Write-Host "DART earnings and contract disclosure signals: $DisclosureBgnDe ~ $EndDe"
  & (Join-Path $root "disclosure_signals.ps1") -BgnDe $DisclosureBgnDe -EndDe $EndDe -ApiKey $ApiKey -MaxSearchPages 20 -MaxCandidates 120 -MaxDocuments 25
} else {
  Write-Host "Skipping disclosure signal refresh for fast daily update."
}

if ($RefreshShareholders -or $FullRefresh) {
  Write-Host "DART regular-report shareholder snapshot"
  & (Join-Path $root "shareholder_snapshot.ps1") -ApiKey $ApiKey -MaxStocks 180
} else {
  Write-Host "Skipping shareholder snapshot refresh for fast daily update."
}

if ($RefreshLogos -or $FullRefresh) {
  Write-Host "DART company homepage favicon cache"
  & (Join-Path $root "company_logos.ps1") -ApiKey $ApiKey -MaxStocks 260
} else {
  Write-Host "Skipping company logo refresh for fast daily update."
}

Write-Host "Price cache update: recent daily closes"
$recentPriceJs = Join-Path $root "update_recent_prices.js"
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodePath = $null
if (Test-Path -LiteralPath $bundledNode) {
  $nodePath = $bundledNode
} else {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCommand) { $nodePath = $nodeCommand.Source }
}
if ($nodePath -and (Test-Path -LiteralPath $recentPriceJs)) {
  & $nodePath $recentPriceJs --concurrency 32 --recent-days $PriceRecentDays --timeout-ms 9000
} else {
  Write-Host "Node not found. Falling back to slower PowerShell price updater."
  & (Join-Path $root "update_prices.ps1") -Range $PriceRange -Interval "1d" -SleepMs $PriceSleepMs
}

Write-Host "Daily update complete."
Write-Host "Important: current close is based on the latest available price cache date, independent of receipt-date filters."

if ($SendTelegram -and -not $SkipTelegram) {
  $telegramScript = Join-Path $root "telegram_notify.ps1"
  if (Test-Path -LiteralPath $telegramScript) {
    Write-Host "Telegram daily disclosure notification"
    & $telegramScript
  }
  $telegramImageScript = Join-Path $root "telegram_brief_image.ps1"
  if (Test-Path -LiteralPath $telegramImageScript) {
    Write-Host "Telegram daily disclosure image"
    & $telegramImageScript
  }
}

