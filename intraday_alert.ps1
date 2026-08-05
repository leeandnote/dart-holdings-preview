param(
  [string]$ApiKey = $env:DART_API_KEY,
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$ChatId = $env:TELEGRAM_CHAT_ID,
  [string]$Date = "",
  [int]$MaxItems = 20,
  [string]$DataPath = "",
  [string]$StatePath = "",
  [switch]$EnrichDetails,
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
  if (-not $Row) { return $null }
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

function Invoke-DartJson([string]$Path, [hashtable]$Params) {
  $queryString = ($Params.GetEnumerator() | ForEach-Object {
    "{0}={1}" -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value)
  }) -join "&"
  $uri = "https://opendart.fss.or.kr/api/$Path`?$queryString"
  $response = Invoke-RestMethod -Uri $uri -Method Get -Headers @{ "User-Agent" = "leeandnote-intraday-alert/1.0" } -TimeoutSec 45
  if ($response.status -ne "000" -and $response.status -ne "013") {
    throw "DART API error $($response.status): $($response.message)"
  }
  return $response
}

function Get-MajorDetailByReceipt([object]$ListItem) {
  $corpCode = [string]$ListItem.corp_code
  $receiptNo = [string]$ListItem.rcept_no
  if (-not $corpCode -or -not $receiptNo) { return $null }

  try {
    $data = Invoke-DartJson -Path "majorstock.json" -Params @{
      crtfc_key = $ApiKey
      corp_code = $corpCode
      bsns_year = (Get-KstNow).Year
      reprt_code = "11011"
    }
    $match = @($data.list | Where-Object { [string]$_.rcept_no -eq $receiptNo } | Select-Object -First 1)
    if ($match.Count -eq 0) { return $null }

    $item = $match[0]
    $itemDate = Normalize-Date ([string]$item.rcept_dt)
    $reporterName = [string]$item.repror
    $previousItem = @($data.list | Where-Object {
      [string]$_.rcept_no -ne $receiptNo -and
      [string]$_.repror -eq $reporterName -and
      (Normalize-Date ([string]$_.rcept_dt)) -lt $itemDate
    } | Sort-Object @{ Expression = { Normalize-Date ([string]$_.rcept_dt) }; Descending = $true }, @{ Expression = { [string]$_.rcept_no }; Descending = $true } | Select-Object -First 1)

    $current = Convert-ToNumber $item.stkrt
    $delta = Convert-ToNumber $item.stkrt_irds
    $previous = $null
    if ($null -ne $current -and $null -ne $delta) {
      $previous = [math]::Round($current - $delta, 4)
    }
    $currentContract = Convert-ToNumber $item.ctr_stkrt
    $previousContract = $null
    if ($previousItem.Count -gt 0) {
      $previousContract = Convert-ToNumber $previousItem[0].ctr_stkrt
    }
    $obligationDate = Normalize-Date ([string]$(if ($item.report_ostn) { $item.report_ostn } elseif ($item.report_de) { $item.report_de } elseif ($item.report_dt) { $item.report_dt } else { $item.rcept_dt }))

    return [pscustomobject]@{
      보고의무발생일 = $obligationDate
      접수일 = Normalize-Date ([string]$item.rcept_dt)
      종목명 = [string]$item.corp_name
      종목코드 = [string]$ListItem.stock_code
      보고자 = [string]$item.repror
      직전지분율 = $previous
      이번지분율 = $current
      증감률 = $delta
      직전주요계약지분율 = $previousContract
      이번주요계약지분율 = $currentContract
      주요계약주식수 = [string]$item.ctr_stkqy
      보고사유 = [string]$item.report_resn
      접수번호 = $receiptNo
    }
  } catch {
    Write-Host "Major detail could not be loaded for ${receiptNo}: $($_.Exception.Message)"
    return $null
  }
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

function Get-IntradayChangeLines([object]$CachedRow) {
  $lines = New-Object System.Collections.Generic.List[string]
  if (-not $CachedRow) {
    return @()
  }

  $previousHoldingValue = Convert-ToNumber (Get-JsonField $CachedRow @("직전지분율"))
  $currentHoldingValue = Convert-ToNumber (Get-JsonField $CachedRow @("이번지분율"))
  $previousContractValue = Convert-ToNumber (Get-JsonField $CachedRow @("직전주요계약지분율"))
  $currentContractValue = Convert-ToNumber (Get-JsonField $CachedRow @("이번주요계약지분율", "주요계약지분율"))

  $holdingText = ""
  if ($null -ne $previousHoldingValue -and $null -ne $currentHoldingValue) {
    $holdingText = "$(Format-Percent $previousHoldingValue) → $(Format-Percent $currentHoldingValue)"
  }

  $contractText = ""
  if ($null -ne $previousContractValue -and $null -ne $currentContractValue) {
    $contractText = "$(Format-Percent $previousContractValue) → $(Format-Percent $currentContractValue)"
  }

  $holdingDelta = if ($null -ne $previousHoldingValue -and $null -ne $currentHoldingValue) { [math]::Abs($currentHoldingValue - $previousHoldingValue) } else { -1 }
  $contractDelta = if ($null -ne $previousContractValue -and $null -ne $currentContractValue) { [math]::Abs($currentContractValue - $previousContractValue) } else { -1 }

  if ($contractText -and $contractDelta -gt [math]::Max($holdingDelta, 0.001)) {
    $lines.Add("<b>주요계약체결 비율</b>: $contractText")
    if ($holdingText) {
      $lines.Add("<b>보유비율</b>: $holdingText")
    }
  } elseif ($holdingText) {
    $lines.Add("<b>보유비율</b>: $holdingText")
    if ($contractText -and $contractDelta -gt 0.001) {
      $lines.Add("<b>주요계약체결 비율</b>: $contractText")
    }
  } elseif ($contractText) {
    $lines.Add("<b>주요계약체결 비율</b>: $contractText")
  }

  return @($lines)
}

function Get-IntradayReason([object]$CachedRow) {
  if (-not $CachedRow) { return "" }
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
  return ""
}

function Get-ReporterType([string]$Reporter, [string]$Reason) {
  $text = "$Reporter $Reason"
  $lower = $text.ToLowerInvariant()
  $foreignWords = @(
    "blackrock", "morgan", "jpmorgan", "jp morgan", "goldman", "dalton", "vanguard",
    "fidelity", "wellington", "mirae asset global", "templeton", "capital", "llc", "ltd",
    "plc", "limited", "inc.", "inc", "assetmanagement", "investment"
  )
  foreach ($word in $foreignWords) {
    if ($lower.Contains($word)) { return "외국계 금융" }
  }
  if ($Reporter -match "국민연금|연기금|공무원연금|사학연금|교직원공제|군인공제") { return "연기금·공제회" }
  if ($Reporter -match "자산운용|투자신탁|투자자문|증권|캐피탈|벤처|사모|펀드|조합|신기술|인베스트|파트너스|운용") { return "국내 금융·투자" }
  if ($Reporter -match "홀딩스|지주|컨소시엄|컴퍼니|코퍼레이션|산업|상사|전자|화학|건설|테크|솔루션|시스템|바이오|엔터") { return "전략적/관계사" }
  if ($text -match "대표|회장|임원|최대주주|특별관계자|친인척|증여|상속|담보") { return "오너·특수관계" }
  if ($Reporter.Trim() -match "^[가-힣]{2,5}$") { return "개인" }
  return "기타/확인필요"
}

function Format-DisplayDate([string]$Value) {
  $normalized = Normalize-Date $Value
  if ($normalized.Length -ne 8) { return "" }
  return "$($normalized.Substring(0,4))-$($normalized.Substring(4,2))-$($normalized.Substring(6,2))"
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
  $telegramToken = ([string]$BotToken).Trim()
  if ($telegramToken.StartsWith("bot")) {
    $telegramToken = $telegramToken.Substring(3)
  }
  $body = @{
    chat_id = $ChatId
    text = $Text
    parse_mode = "HTML"
    disable_web_page_preview = $false
  }
  Invoke-RestMethod -Uri "https://api.telegram.org/bot$telegramToken/sendMessage" -Method Post -Body $body -TimeoutSec 30 | Out-Null
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

$confirmedItems = New-Object System.Collections.Generic.List[object]
foreach ($item in $newItems) {
  if ($confirmedItems.Count -ge $MaxItems) { break }
  $receiptNo = [string]$item.rcept_no
  $cachedRow = if ($latestRowsByReceipt.ContainsKey($receiptNo)) { $latestRowsByReceipt[$receiptNo] } else { $null }
  if ($EnrichDetails) {
    $detailRow = Get-MajorDetailByReceipt -ListItem $item
    if ($detailRow) {
      $cachedRow = $detailRow
    }
  }
  $changeLines = @(Get-IntradayChangeLines -CachedRow $cachedRow)
  $reasonTextRaw = Get-IntradayReason -CachedRow $cachedRow
  $confirmedItems.Add([pscustomobject]@{
    Item = $item
    Row = $cachedRow
    ChangeLines = $changeLines
    Reason = $reasonTextRaw
  }) | Out-Null
}

if ($confirmedItems.Count -eq 0) {
  $state.updatedAt = $now.ToString("yyyy-MM-dd HH:mm:ss")
  if (-not $DryRun) {
    Save-State -State $state
  }
  Write-Host "No intraday holdings disclosures to send for $Date. new=$($newItems.Count)"
  exit 0
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("<b>[장중 대량보유 공시 알림]</b>")
$lines.Add("기준: $($now.ToString("yyyy-MM-dd HH:mm")) KST")
$lines.Add("접수일: $($Date.Substring(0,4))-$($Date.Substring(4,2))-$($Date.Substring(6,2))")
$lines.Add("대량보유 공시: <b>$($confirmedItems.Count)건</b>")
$lines.Add("")

$i = 1
foreach ($entry in $confirmedItems) {
  $item = $entry.Item
  $cachedRow = $entry.Row
  $stockCode = [string]$item.stock_code
  $market = if ($marketMap.ContainsKey($stockCode)) { $marketMap[$stockCode].Market } else { "" }
  $corpName = Escape-Html ([string]$item.corp_name)
  $reporter = Escape-Html ([string]$item.flr_nm)
  $receiptNo = [string]$item.rcept_no
  if ($cachedRow) {
    $cachedReporter = [string](Get-JsonField $cachedRow @("보고자"))
    if ($cachedReporter) { $reporter = Escape-Html $cachedReporter }
  }
  $changeLines = @($entry.ChangeLines)
  $reasonTextRaw = [string]$entry.Reason
  $reasonText = Escape-Html $reasonTextRaw
  $reporterType = Escape-Html (Get-ReporterType -Reporter ([string]($reporter -replace "&amp;", "&")) -Reason $reasonTextRaw)
  $obligationDate = Format-DisplayDate ([string](Get-JsonField $cachedRow @("보고의무발생일")))
  $dartUrl = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=$receiptNo"
  $codeLine = if ($market) { "$stockCode · $market" } else { "$stockCode" }
  $lines.Add("<b>$i. $corpName</b> ($reporter · $reporterType)")
  foreach ($changeLine in $changeLines) {
    $lines.Add("   $changeLine")
  }
  if ($reasonText) {
    $lines.Add("   <b>보고사유</b>: $reasonText")
  } elseif ($item.report_nm) {
    $reportName = Escape-Html ([string]$item.report_nm)
    $lines.Add("   <b>공시명</b>: $reportName")
  }
  if ($obligationDate) {
    $lines.Add("   <b>보고의무발생일</b>: $obligationDate")
  }
  $lines.Add("   $codeLine · <a href=""$dartUrl"">원문 보기</a>")
  $lines.Add("")
  $i += 1
}
Send-TelegramMessage -Text ($lines -join "`n")

$mergedSent = @($state.sent)
foreach ($entry in $confirmedItems) {
  $item = $entry.Item
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

Write-Host "Intraday Telegram alert sent for $Date. confirmed=$($confirmedItems.Count), new=$($newItems.Count)"

