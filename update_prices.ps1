param(
  [string]$Range = "1y",
  [string]$Interval = "1d",
  [int]$MaxStocks = 0,
  [int]$SleepMs = 120
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path (Join-Path $root "site") "data"
$latestPath = Join-Path $dataDir "latest.json"
$pricesJsonPath = Join-Path $dataDir "prices.json"
$pricesJsPath = Join-Path $dataDir "prices.js"
$eventPricesJsPath = Join-Path $dataDir "event_prices.js"
$currentPricesJsPath = Join-Path $dataDir "current_prices.js"
$priceChunkDir = Join-Path $dataDir "prices"

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

$latest = Get-Content -LiteralPath $latestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$stocks = @{}

foreach ($row in $latest.rows) {
  # latest.json column order can be either:
  # old: 0 receipt date, 1 market, 3 company name, 4 stock code
  # new: 0 obligation date, 1 receipt date, 2 market, 4 company name, 5 stock code
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

$prices = [ordered]@{}
$errors = @()
$index = 0

foreach ($stock in $targets) {
  $index += 1
  $symbol = $stock.symbol
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/$symbol`?range=$Range&interval=$Interval&events=history&includeAdjustedClose=true"
  Write-Host "[$index/$($targets.Count)] $($stock.code) $($stock.name) $symbol"
  try {
    $response = Invoke-RestMethod -Uri $url -TimeoutSec 20 -Headers @{ "User-Agent" = "Mozilla/5.0" }
    $result = $response.chart.result[0]
    if ($null -eq $result -or $null -eq $result.timestamp) {
      throw "empty chart result"
    }
    $quote = $result.indicators.quote[0]
    $items = @()
    for ($i = 0; $i -lt $result.timestamp.Count; $i++) {
      if ($null -eq $quote.open[$i] -or $null -eq $quote.high[$i] -or $null -eq $quote.low[$i] -or $null -eq $quote.close[$i]) {
        continue
      }
      $date = [DateTimeOffset]::FromUnixTimeSeconds([int64]$result.timestamp[$i]).ToOffset([TimeSpan]::FromHours(9)).ToString("yyyy-MM-dd")
      $items += [ordered]@{
        date = $date
        open = [math]::Round([double]$quote.open[$i], 2)
        high = [math]::Round([double]$quote.high[$i], 2)
        low = [math]::Round([double]$quote.low[$i], 2)
        close = [math]::Round([double]$quote.close[$i], 2)
        volume = if ($null -ne $quote.volume[$i]) { [int64]$quote.volume[$i] } else { 0 }
      }
    }
    if ($items.Count -gt 0) {
      $prices[$stock.code] = $items
    }
  } catch {
    $errors += [ordered]@{
      code = $stock.code
      name = $stock.name
      symbol = $symbol
      error = $_.Exception.Message
    }
  }
  Start-Sleep -Milliseconds $SleepMs
}

$payload = [ordered]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  source = "Yahoo Finance chart API"
  range = $Range
  interval = $Interval
  stockCount = $prices.Count
  errorCount = $errors.Count
  errors = $errors
  prices = $prices
}

$json = $payload | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $pricesJsonPath -Value $json -Encoding UTF8

New-Item -ItemType Directory -Force -Path $priceChunkDir | Out-Null
foreach ($code in $prices.Keys) {
  $itemsJson = $prices[$code] | ConvertTo-Json -Depth 5 -Compress
  $chunk = "window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {}; window.__PRICE_CHUNKS__['$code'] = $itemsJson;"
  Set-Content -LiteralPath (Join-Path $priceChunkDir "$code.js") -Value $chunk -Encoding UTF8
}

$currentPrices = [ordered]@{}
foreach ($code in $prices.Keys) {
  $latestPrice = @($prices[$code]) | Select-Object -Last 1
  if ($latestPrice) {
    $currentPrices[$code] = [ordered]@{
      date = $latestPrice.date
      close = $latestPrice.close
    }
  }
}
$currentJson = $currentPrices | ConvertTo-Json -Depth 4 -Compress
Set-Content -LiteralPath $currentPricesJsPath -Value ("window.__CURRENT_PRICES__ = " + $currentJson + ";") -Encoding UTF8

$indexPayload = [ordered]@{
  generatedAt = $payload.generatedAt
  source = $payload.source
  range = $payload.range
  interval = $payload.interval
  stockCount = $payload.stockCount
  errorCount = $payload.errorCount
  errors = $payload.errors
  prices = @{}
}
$indexJson = $indexPayload | ConvertTo-Json -Depth 5 -Compress
Set-Content -LiteralPath $pricesJsPath -Value ("window.__PRICE_DATA__ = " + $indexJson + "; window.__PRICE_CHUNKS__ = window.__PRICE_CHUNKS__ || {};") -Encoding UTF8

$eventPrices = [ordered]@{}
foreach ($row in $latest.rows) {
  # Keep this ASCII-only for Windows PowerShell scheduled tasks that may not read UTF-8 literals correctly.
  # new rows: 0 obligation date, 1 receipt date, 5 stock code
  # old rows: 0 receipt date, 4 stock code
  $obligationDate = Get-RowField $row 0
  $rceptDate = Get-RowField $row 1
  $code = Get-RowField $row 5
  if ($rceptDate -notmatch "^\d{8}$") { $rceptDate = Get-RowField $row 0 }
  if (-not $code) { $code = Get-RowField $row 4 }
  if (-not $obligationDate) { $obligationDate = $rceptDate }
  if (-not $obligationDate -or -not $code -or -not $prices.Contains($code)) { continue }
  $key = "$code`_$obligationDate"
  if ($eventPrices.Contains($key)) { continue }
  $target = "$($obligationDate.Substring(0,4))-$($obligationDate.Substring(4,2))-$($obligationDate.Substring(6,2))"
  $best = $null
  $bestDiff = [double]::PositiveInfinity
  foreach ($item in $prices[$code]) {
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
Set-Content -LiteralPath $eventPricesJsPath -Value ("window.__EVENT_PRICES__ = " + $eventJson + ";") -Encoding UTF8

Write-Host "Price cache done: $($prices.Count) stocks, $($errors.Count) errors"
Write-Host $pricesJsPath
