param(
  [string]$Range = "1mo",
  [string]$Interval = "1d",
  [int]$MaxStocks = 0,
  [int]$SleepMs = 0
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path (Join-Path $root "site") "data"
$latestPath = Join-Path $dataDir "latest.json"
$pricesJsPath = Join-Path $dataDir "prices.js"
$eventPricesJsPath = Join-Path $dataDir "event_prices.js"
$currentPricesJsPath = Join-Path $dataDir "current_prices.js"
$priceChunkDir = Join-Path $dataDir "prices"
$cutoffDate = (Get-Date).Date.AddDays(-1)

if (!(Test-Path $latestPath)) {
  throw "latest.json not found. Run major_holdings.ps1 first."
}

function Get-YahooSuffix([string]$market) {
  if ($market -eq "KOSDAQ") { return "KQ" }
  return "KS"
}

function Get-RowField($row, [int]$index) {
  $props = @($row.PSObject.Properties)
  if ($props.Count -le $index) { return "" }
  $value = $props[$index].Value
  if ($null -eq $value) { return "" }
  return "$value"
}

function Read-ExistingChunk([string]$code) {
  $path = Join-Path $priceChunkDir "$code.js"
  if (!(Test-Path -LiteralPath $path)) { return @() }
  $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  $match = [regex]::Match($text, "=\s*(\[.*\]);?\s*$", [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (!$match.Success) { return @() }
  try {
    return @($match.Groups[1].Value | ConvertFrom-Json)
  } catch {
    return @()
  }
}

function Get-RecentYahooCandles($stock) {
  $symbol = $stock.symbol
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/$symbol`?range=$Range&interval=$Interval&events=history&includeAdjustedClose=true"
  $response = Invoke-RestMethod -Uri $url -TimeoutSec 20 -Headers @{ "User-Agent" = "Mozilla/5.0" }
  $result = $response.chart.result[0]
  if ($null -eq $result -or $null -eq $result.timestamp) { throw "empty chart result" }
  $quote = $result.indicators.quote[0]
  $items = @()
  for ($i = 0; $i -lt $result.timestamp.Count; $i++) {
    if ($null -eq $quote.open[$i] -or $null -eq $quote.high[$i] -or $null -eq $quote.low[$i] -or $null -eq $quote.close[$i]) {
      continue
    }
    $date = [DateTimeOffset]::FromUnixTimeSeconds([int64]$result.timestamp[$i]).ToOffset([TimeSpan]::FromHours(9)).DateTime
    if ($date.Date -gt $cutoffDate) { continue }
    $items += [ordered]@{
      date = $date.ToString("yyyy-MM-dd")
      open = [math]::Round([double]$quote.open[$i], 2)
      high = [math]::Round([double]$quote.high[$i], 2)
      low = [math]::Round([double]$quote.low[$i], 2)
      close = [math]::Round([double]$quote.close[$i], 2)
      volume = if ($null -ne $quote.volume[$i]) { [int64]$quote.volume[$i] } else { 0 }
    }
  }
  return @($items)
}

function Merge-Candles($oldItems, $newItems) {
  $map = [ordered]@{}
  foreach ($item in @($oldItems)) {
    if ($item.date) { $map[$item.date] = $item }
  }
  foreach ($item in @($newItems)) {
    if ($item.date) { $map[$item.date] = $item }
  }
  return @($map.Values | Sort-Object date)
}

$latest = Get-Content -LiteralPath $latestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$stocks = @{}

foreach ($row in $latest.rows) {
  $market = Get-RowField $row 1
  $name = Get-RowField $row 3
  $code = Get-RowField $row 4
  if ($market -ne "KOSPI" -and $market -ne "KOSDAQ") {
    $market = Get-RowField $row 2
    $name = Get-RowField $row 4
    $code = Get-RowField $row 5
  }
  if ($code -and ($market -eq "KOSPI" -or $market -eq "KOSDAQ")) {
    $stocks[$code] = [ordered]@{
      code = $code
      market = $market
      name = $name
      symbol = "$code.$(Get-YahooSuffix $market)"
    }
  }
}

$targets = @($stocks.Values | Sort-Object market, code)
if ($MaxStocks -gt 0) {
  $targets = @($targets | Select-Object -First $MaxStocks)
}

New-Item -ItemType Directory -Force -Path $priceChunkDir | Out-Null

$currentPrices = [ordered]@{}
$mergedPrices = [ordered]@{}
$errors = @()
$index = 0
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

foreach ($stock in $targets) {
  $index += 1
  Write-Host "[$index/$($targets.Count)] recent price $($stock.code) $($stock.name)"
  try {
    $old = Read-ExistingChunk $stock.code
    $new = Get-RecentYahooCandles $stock
    $merged = Merge-Candles $old $new
    if ($merged.Count -gt 0) {
      $itemsJson = $merged | ConvertTo-Json -Depth 5 -Compress
      $chunk = "window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {}; window.__PRICE_CHUNKS__['$($stock.code)'] = $itemsJson;"
      [System.IO.File]::WriteAllText((Join-Path $priceChunkDir "$($stock.code).js"), $chunk, $utf8NoBom)
      $latestPrice = @($merged | Where-Object { ([datetime]$_.date).Date -le $cutoffDate }) | Select-Object -Last 1
      if ($latestPrice) {
        $currentPrices[$stock.code] = [ordered]@{
          date = $latestPrice.date
          close = $latestPrice.close
        }
      }
      $mergedPrices[$stock.code] = $merged
    }
  } catch {
    $errors += [ordered]@{
      code = $stock.code
      name = $stock.name
      symbol = $stock.symbol
      error = $_.Exception.Message
    }
  }
  if ($SleepMs -gt 0) { Start-Sleep -Milliseconds $SleepMs }
}

$currentJson = $currentPrices | ConvertTo-Json -Depth 4 -Compress
[System.IO.File]::WriteAllText($currentPricesJsPath, ("window.__CURRENT_PRICES__ = " + $currentJson + ";"), $utf8NoBom)

$indexPayload = [ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  source = "Yahoo Finance chart API recent merge"
  range = $Range
  interval = $Interval
  completeCloseCutoff = $cutoffDate.ToString("yyyy-MM-dd")
  stockCount = $currentPrices.Count
  errorCount = $errors.Count
  errors = $errors
  prices = @{}
}
$indexJson = $indexPayload | ConvertTo-Json -Depth 5 -Compress
[System.IO.File]::WriteAllText($pricesJsPath, ("window.__PRICE_DATA__ = " + $indexJson + "; window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {};"), $utf8NoBom)

$eventPrices = [ordered]@{}
foreach ($row in $latest.rows) {
  $obligationDate = Get-RowField $row 0
  $rceptDate = Get-RowField $row 1
  $code = Get-RowField $row 5
  if ($rceptDate -notmatch "^\d{8}$") { $rceptDate = Get-RowField $row 0 }
  if (-not $code) { $code = Get-RowField $row 4 }
  if (-not $obligationDate) { $obligationDate = $rceptDate }
  if (-not $obligationDate -or -not $code) { continue }
  $items = if ($mergedPrices.Contains($code)) { $mergedPrices[$code] } else { Read-ExistingChunk $code }
  if (!$items -or $items.Count -eq 0) { continue }
  $key = "$code`_$obligationDate"
  if ($eventPrices.Contains($key)) { continue }
  $target = "$($obligationDate.Substring(0,4))-$($obligationDate.Substring(4,2))-$($obligationDate.Substring(6,2))"
  $best = $null
  $bestDiff = [double]::PositiveInfinity
  foreach ($item in @($items)) {
    $diff = [Math]::Abs(([datetime]$item.date - [datetime]$target).TotalDays)
    if ($diff -lt $bestDiff) {
      $bestDiff = $diff
      $best = $item
    }
  }
  if ($best) {
    $eventPrices[$key] = [ordered]@{
      date = $best.date
      close = $best.close
    }
  }
}
$eventJson = $eventPrices | ConvertTo-Json -Depth 4 -Compress
[System.IO.File]::WriteAllText($eventPricesJsPath, ("window.__EVENT_PRICES__ = " + $eventJson + ";"), $utf8NoBom)

Write-Host "Recent price cache done: $($currentPrices.Count) stocks, $($errors.Count) errors, cutoff $($cutoffDate.ToString('yyyy-MM-dd'))"
