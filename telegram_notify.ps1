param(
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$ChatId = $env:TELEGRAM_CHAT_ID,
  [string]$DataPath = (Join-Path $PSScriptRoot "site\data\latest.json"),
  [string]$SiteUrl = $env:SITE_URL,
  [string]$ReportDate = "",
  [int]$Top = 5,
  [switch]$DryRun,
  [switch]$EnableWebPreview
)

$ErrorActionPreference = "Stop"

function Convert-ToNumber([object]$Value) {
  if ($null -eq $Value) { return $null }
  $text = [string]$Value
  $text = $text.Replace(",", "").Replace("%", "").Trim()
  if (-not $text -or $text -eq "-") { return $null }
  $number = 0.0
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return $number
  }
  return $null
}

function Format-DateText([string]$Value) {
  if ($Value -match '^\d{8}$') {
    return "$($Value.Substring(0,4))-$($Value.Substring(4,2))-$($Value.Substring(6,2))"
  }
  return $Value
}

function Format-ShortDate([string]$Value) {
  if ($Value -match '^\d{8}$') {
    return $Value.Substring(2,6)
  }
  $digits = ($Value -replace '\D', '')
  if ($digits.Length -ge 8) {
    return $digits.Substring(2,6)
  }
  return $Value
}

function Format-Eok([object]$Value) {
  if ($null -eq $Value) { return "확인불가" }
  $eok = [math]::Round(([double]$Value) / 100000000)
  if ($eok -eq 0) { return "0억원" }
  $mark = if ($eok -gt 0) { "▲" } else { "▼" }
  return "$mark$(([math]::Abs($eok)).ToString('N0'))억원"
}

function Get-Field([object]$Row, [string[]]$Names) {
  foreach ($name in $Names) {
    if ($Row.PSObject.Properties[$name]) {
      return $Row.PSObject.Properties[$name].Value
    }
  }
  return $null
}

function Escape-TelegramHtml([string]$Text) {
  if ($null -eq $Text) { return "" }
  return ([string]$Text).Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
}

if ((-not $BotToken -or -not $ChatId) -and -not $DryRun) {
  Write-Host "Telegram credentials not configured. Skipping notification."
  exit 0
}

if ($BotToken -and -not $BotToken.StartsWith("bot")) {
  $BotToken = "bot$BotToken"
}

if (-not $SiteUrl) {
  $SiteUrl = "https://dart-holdings-preview.vercel.app"
}

if (-not (Test-Path -LiteralPath $DataPath)) {
  throw "Data file not found: $DataPath"
}

$payload = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
$rows = @($payload.rows)
if (-not $rows.Count) {
  Write-Host "No rows in latest.json. Skipping notification."
  exit 0
}

if (-not $ReportDate) {
  $ReportDate = ($rows | ForEach-Object { Get-Field $_ @("접수일") } | Where-Object { $_ } | Sort-Object -Descending | Select-Object -First 1)
}

$daily = @($rows | Where-Object { (Get-Field $_ @("접수일")) -eq $ReportDate })
if (-not $daily.Count) {
  Write-Host "No disclosures for $ReportDate. Skipping notification."
  exit 0
}

$eventPrices = $null
$eventJsonPath = Join-Path $PSScriptRoot "site\data\event_prices.json"
$eventJsPath = Join-Path $PSScriptRoot "site\data\event_prices.js"
if (Test-Path -LiteralPath $eventJsonPath) {
  $eventPrices = Get-Content -LiteralPath $eventJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
} elseif (Test-Path -LiteralPath $eventJsPath) {
  $rawEvent = Get-Content -LiteralPath $eventJsPath -Raw -Encoding UTF8
  $jsonEvent = $rawEvent -replace '^\s*window\.__EVENT_PRICES__\s*=\s*', ''
  $jsonEvent = $jsonEvent -replace ';\s*$', ''
  $eventPrices = $jsonEvent | ConvertFrom-Json
}

$enriched = foreach ($row in $daily) {
  $code = [string](Get-Field $row @("종목코드"))
  $receiptDate = [string](Get-Field $row @("접수일"))
  $obligationDate = [string](Get-Field $row @("보고의무발생일", "보고의무발생일자", "변동일"))
  if (-not $obligationDate) { $obligationDate = $receiptDate }
  $shareDelta = Convert-ToNumber (Get-Field $row @("증감주식수"))
  $price = $null
  $priceKey = "${code}_${obligationDate}"
  if ($eventPrices -and $eventPrices.PSObject.Properties[$priceKey]) {
    $price = Convert-ToNumber $eventPrices.PSObject.Properties[$priceKey].Value.close
  }
  $tradeValue = if ($null -ne $price -and $null -ne $shareDelta) { $price * $shareDelta } else { $null }
  [pscustomobject]@{
    Date = $receiptDate
    ObligationDate = $obligationDate
    CorpName = [string](Get-Field $row @("종목명"))
    StockCode = $code
    Reporter = [string](Get-Field $row @("보고자"))
    Previous = Convert-ToNumber (Get-Field $row @("직전지분율"))
    Current = Convert-ToNumber (Get-Field $row @("이번지분율"))
    ShareDelta = $shareDelta
    TradeValue = $tradeValue
    Crossed = ([string](Get-Field $row @("5퍼센트상향돌파")) -eq "Y")
    Url = [string](Get-Field $row @("DART_URL"))
  }
}

$inflows = @($enriched | Where-Object { $null -ne $_.TradeValue -and $_.TradeValue -gt 0 } | Sort-Object TradeValue -Descending | Select-Object -First $Top)
$outflows = @($enriched | Where-Object { $null -ne $_.TradeValue -and $_.TradeValue -lt 0 } | Sort-Object @{ Expression = { [math]::Abs($_.TradeValue) }; Descending = $true } | Select-Object -First $Top)
$crossed = @($enriched | Where-Object { $_.Crossed -or (($null -ne $_.Previous -and $null -ne $_.Current) -and $_.Previous -lt 5 -and $_.Current -ge 5) } | Sort-Object Current -Descending | Select-Object -First $Top)
$buyTotal = ($enriched | Where-Object { $null -ne $_.TradeValue -and $_.TradeValue -gt 0 } | Measure-Object -Property TradeValue -Sum).Sum
$sellTotal = ($enriched | Where-Object { $null -ne $_.TradeValue -and $_.TradeValue -lt 0 } | Measure-Object -Property TradeValue -Sum).Sum

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("<b>[$(Escape-TelegramHtml (Format-ShortDate $ReportDate)) 리앤노트 일일 공시 업데이트]</b>")
$lines.Add("접수일: $(Escape-TelegramHtml (Format-DateText $ReportDate))")
$lines.Add("대량보유 공시: <b>$($daily.Count)건</b>")
$lines.Add("추정 매수: $(Escape-TelegramHtml (Format-Eok $buyTotal)) / 추정 매도: $(Escape-TelegramHtml (Format-Eok $sellTotal))")
$lines.Add("")

if ($inflows.Count) {
  $lines.Add("<b>매수성 변동 Top</b>")
  $rank = 1
  foreach ($item in $inflows) {
    $lines.Add("$rank. $(Escape-TelegramHtml $item.CorpName) ($(Escape-TelegramHtml $item.Reporter)) $(Escape-TelegramHtml (Format-Eok $item.TradeValue))")
    $rank++
  }
  $lines.Add("")
}

if ($outflows.Count) {
  $lines.Add("<b>매도성 변동 Top</b>")
  $rank = 1
  foreach ($item in $outflows) {
    $lines.Add("$rank. $(Escape-TelegramHtml $item.CorpName) ($(Escape-TelegramHtml $item.Reporter)) $(Escape-TelegramHtml (Format-Eok $item.TradeValue))")
    $rank++
  }
  $lines.Add("")
}

if ($crossed.Count) {
  $lines.Add("<b>신규 5% 진입</b>")
  $rank = 1
  foreach ($item in $crossed) {
    $shareText = if ($null -ne $item.Previous -and $null -ne $item.Current) { "{0:N2}% → {1:N2}%" -f $item.Previous, $item.Current } else { "지분율 확인" }
    $lines.Add("$rank. $(Escape-TelegramHtml $item.CorpName) ($(Escape-TelegramHtml $item.Reporter)) $(Escape-TelegramHtml $shareText)")
    $rank++
  }
  $lines.Add("")
}

if ($SiteUrl) {
  $url = $SiteUrl.TrimEnd("/")
  $lines.Add("<a href=""$url/"">대시보드 보기</a> · <a href=""$url/blog.html"">일별 리포트</a>")
}

$message = ($lines -join "`n")

if ($DryRun) {
  Write-Host $message
  exit 0
}

$apiUrl = "https://api.telegram.org/$BotToken/sendMessage"
$body = @{
  chat_id = $ChatId
  text = $message
  parse_mode = "HTML"
  disable_web_page_preview = (-not $EnableWebPreview)
}

Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/x-www-form-urlencoded" | Out-Null
Write-Host "Telegram notification sent for $ReportDate."

