param(
  [string]$ApiKey = $env:DART_API_KEY,
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$ChatId = $env:TELEGRAM_CHAT_ID,
  [string]$Date = "",
  [int]$MaxItems = 20,
  [string]$DataPath = "",
  [string]$StatePath = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not $DataPath) {
  $DataPath = Join-Path $root "site\data\latest.json"
}
if (-not $StatePath) {
  $StatePath = Join-Path $root "site\data\intraday_alert_state.json"
}

function Get-KstNow() {
  try {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById("Korea Standard Time")
  } catch {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById("Asia/Seoul")
  }
  return [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
}

function Normalize-Date([string]$Value) {
  if (-not $Value) { return "" }
  return ([string]$Value).Replace("-", "").Trim()
}

function Escape-Html([string]$Value) {
  if ($null -eq $Value) { return "" }
  return ([string]$Value).
    Replace("&", "&amp;").
    Replace("<", "&lt;").
    Replace(">", "&gt;")
}

function Convert-ToNumber([object]$Value) {
  if ($null -eq $Value) { return $null }
  $text = ([string]$Value).Replace(",", "").Replace("%", "").Trim()
  if (-not $text -or $text -eq "-") { return $null }
  $number = 0.0
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return $number
  }
  return $null
}

function Get-JsonField([object]$Row, [string[]]$Names) {
  foreach ($name in $Names) {
    if ($Row.PSObject.Properties[$name]) {
      return $Row.PSObject.Properties[$name].Value
    }
  }
  return $null
}

function Get-DartList([string]$TargetDate) {
  $all = @()
  $page = 1
  do {
    $uri = "https://opendart.fss.or.kr/api/list.json?crtfc_key=$ApiKey&bgn_de=$TargetDate&end_de=$TargetDate&page_no=$page&page_count=100&last_reprt_at=N"
    $response = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 30
    if ($response.status -ne "000" -and $response.status -ne "013") {
      throw "DART API error $($response.status): $($response.message)"
    }
    $items = @($response.list)
    if ($items.Count -eq 0) { break }
    $all += $items
    $page += 1
  } while ($page -le 20)
  return @($all)
}

function Load-MarketMap() {
  $map = @{}
  if (-not (Test-Path -LiteralPath $DataPath)) { return $map }
  try {
    $payload = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($corp in @($payload.corps)) {
      $code = [string]$corp.stockCode
      if ($code -and -not $map.ContainsKey($code)) {
        $map[$code] = [pscustomobject]@{
          Name = [string]$corp.name
          Market = [string]$corp.market
        }
      }
    }
  } catch {
    Write-Host "Market map could not be loaded. Proceeding with stock-code only filter."
  }
  return $map
}

function Load-LatestRowsByReceipt() {
  $map = @{}
  if (-not (Test-Path -LiteralPath $DataPath)) { return $map }
  try {
    $payload = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($row in @($payload.rows)) {
      $receiptNo = [string](Get-JsonField $row @("접수번호", "rcept_no"))
      if ($receiptNo -and -not $map.ContainsKey($receiptNo)) {
        $map[$receiptNo] = $row
      }
    }
  } catch {
    Write-Host "Latest disclosure cache could not be loaded. Intraday alert will use DART list fields only."
  }
  return $map
}

function Format-Percent([object]$Value) {
  $number = Convert-ToNumber $Value
  if ($null -eq $number) { return "" }
  return "{0:N2}%" -f $number
}

function Get-IntradayShareChange([object]$CachedRow) {
  $pending = "$([char]0xC9C0)$([char]0xBD84)$([char]0xBCC0)$([char]0xB3D9) $([char]0xD655)$([char]0xC778)$([char]0xC911)"
  if (-not $CachedRow) { return $null }
  $previous = Format-Percent (Get-JsonField $CachedRow @("직전지분율"))
  $current = Format-Percent (Get-JsonField $CachedRow @("이번지분율"))
  if ($previous -and $current) {
    return "$previous → $current"
  }
  return $pending
}

function Get-IntradayReason([object]$CachedRow) {
  if (-not $CachedRow) { return "사유 확인중" }
  $reason = [string](Get-JsonField $CachedRow @("보고사유", "사유", "변동사유"))
  $detail = [string](Get-JsonField $CachedRow @("보고사유상세", "보고사유구체적내용", "상세사유"))
  if ($reason -and $detail) {
    if ($detail.Length -gt 48) {
      $detail = $detail.Substring(0, 48) + "..."
    }
    return "$reason - $detail"
  }
  if ($reason) { return $reason }
  if ($detail) {
    if ($detail.Length -gt 56) {
      $detail = $detail.Substring(0, 56) + "..."
    }
    return $detail
  }
  return "사유 확인중"
}

function Load-State([string]$TargetDate) {
  if (Test-Path -LiteralPath $StatePath) {
    try {
      $state = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ([string]$state.date -eq $TargetDate) {
        return $state
      }
    } catch {}
  }
  return [pscustomobject]@{
    date = $TargetDate
    sent = @()
    updatedAt = ""
  }
}

function Save-State([object]$State) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $StatePath) | Out-Null
  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StatePath -Encoding UTF8
}

function Send-TelegramMessage([string]$Text) {
  if ($DryRun) {
    Write-Host "---- TELEGRAM DRY RUN ----"
    Write-Host $Text
    return
  }
  if (-not $BotToken) { throw "Telegram bot token is missing." }
  if (-not $ChatId) { throw "Telegram chat id is missing." }
  $body = @{
    chat_id = $ChatId
    text = $Text
    parse_mode = "HTML"
    disable_web_page_preview = $false
  }
  Invoke-RestMethod -Uri "https://api.telegram.org/bot$BotToken/sendMessage" -Method Post -Body $body -TimeoutSec 30 | Out-Null
}

if (-not $ApiKey) {
  throw "DART API key is missing."
}

$now = Get-KstNow
if (-not $Date) {
  $Date = $now.ToString("yyyyMMdd")
}
$Date = Normalize-Date $Date

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$marketMap = Load-MarketMap
$latestRowsByReceipt = Load-LatestRowsByReceipt
$state = Load-State -TargetDate $Date
$sentSet = @{}
foreach ($id in @($state.sent)) {
  if ($id) { $sentSet[[string]$id] = $true }
}

$items = Get-DartList -TargetDate $Date
$majorHoldingPattern = "\uB300\uB7C9\uBCF4\uC720\uC0C1\uD669\uBCF4\uACE0\uC11C"
$generalPattern = "\uC77C\uBC18"
$simplePattern = "\uC57D\uC2DD"
$holdings = @($items | Where-Object {
  $reportName = [string]$_.report_nm
  $stockCode = [string]$_.stock_code
  $isTargetReport = $reportName -match $majorHoldingPattern -and ($reportName -match $generalPattern -or $reportName -match $simplePattern)
  $isListed = $stockCode -match "^\d{6}$"
  $marketOk = $true
  if ($marketMap.Count -gt 0) {
    $marketOk = $marketMap.ContainsKey($stockCode) -and (@("KOSPI", "KOSDAQ") -contains [string]$marketMap[$stockCode].Market)
  }
  $isTargetReport -and $isListed -and $marketOk
} | Sort-Object rcept_no)

$newItems = @($holdings | Where-Object {
  $receiptNo = [string]$_.rcept_no
  $receiptNo -and -not $sentSet.ContainsKey($receiptNo)
})

Write-Host "Intraday scan for ${Date}: total=$($items.Count), holdings=$($holdings.Count), new=$($newItems.Count)"

if ($newItems.Count -eq 0) {
  $state.updatedAt = $now.ToString("yyyy-MM-dd HH:mm:ss")
  if (-not $DryRun) {
    Save-State -State $state
  }
  Write-Host "No new intraday holdings disclosures for $Date."
  exit 0
}

$displayItems = @($newItems | Select-Object -First $MaxItems)
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("<b>[장중 대량보유 공시 알림]</b>")
$lines.Add("기준: $($now.ToString("yyyy-MM-dd HH:mm")) KST")
$lines.Add("접수일: $($Date.Substring(0,4))-$($Date.Substring(4,2))-$($Date.Substring(6,2))")
$lines.Add("신규 대량보유 공시: <b>$($newItems.Count)건</b>")
$lines.Add("")

$i = 1
foreach ($item in $displayItems) {
  $stockCode = [string]$item.stock_code
  $market = if ($marketMap.ContainsKey($stockCode)) { $marketMap[$stockCode].Market } else { "" }
  $corpName = Escape-Html ([string]$item.corp_name)
  $reporter = Escape-Html ([string]$item.flr_nm)
  $receiptNo = [string]$item.rcept_no
  $cachedRow = if ($latestRowsByReceipt.ContainsKey($receiptNo)) { $latestRowsByReceipt[$receiptNo] } else { $null }
  if ($cachedRow) {
    $cachedReporter = [string](Get-JsonField $cachedRow @("보고자"))
    if ($cachedReporter) { $reporter = Escape-Html $cachedReporter }
  }
  $shareChangeText = Escape-Html (Get-IntradayShareChange -CachedRow $cachedRow)
  if (-not $shareChangeText) {
    $shareChangeText = Escape-Html "$([char]0xC9C0)$([char]0xBD84)$([char]0xBCC0)$([char]0xB3D9) $([char]0xD655)$([char]0xC778)$([char]0xC911)"
  }
  $reasonText = Escape-Html (Get-IntradayReason -CachedRow $cachedRow)
  $dartUrl = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=$receiptNo"
  $codeLine = if ($market) { "$stockCode · $market" } else { "$stockCode" }
  $lines.Add("<b>$i. $corpName</b> ($reporter)")
  $lines.Add("   <b>지분변동</b>: $shareChangeText")
  $lines.Add("   <b>보고사유</b>: $reasonText")
  $lines.Add("   $codeLine · <a href=""$dartUrl"">원문 보기</a>")
  $i += 1
}
if ($newItems.Count -gt $displayItems.Count) {
  $lines.Add("")
  $lines.Add("외 $($newItems.Count - $displayItems.Count)건은 밤 10시 정식 브리프에서 함께 정리됩니다.")
}

Send-TelegramMessage -Text ($lines -join "`n")

$mergedSent = @($state.sent)
foreach ($item in $newItems) {
  $receiptNo = [string]$item.rcept_no
  if ($receiptNo -and -not ($mergedSent -contains $receiptNo)) {
    $mergedSent += $receiptNo
  }
}
$state.sent = @($mergedSent | Sort-Object -Unique)
$state.updatedAt = $now.ToString("yyyy-MM-dd HH:mm:ss")
if (-not $DryRun) {
  Save-State -State $state
}

Write-Host "Intraday Telegram alert sent for $Date. new=$($newItems.Count)"

