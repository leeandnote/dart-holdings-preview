param(
  [string]$ApiKey = $env:DART_API_KEY,
  [string]$BgnDe = (Get-Date).AddMonths(-6).ToString('yyyyMMdd'),
  [string]$EndDe = (Get-Date).ToString('yyyyMMdd'),
  [string]$CacheDir = ".cache\disclosures",
  [string]$JsonOut = "site\data\disclosure_signals.json",
  [int]$MaxDocuments = 40,
  [int]$MaxSearchPages = 80,
  [int]$MaxCandidates = 300,
  [switch]$SkipDocumentParsing
)

$ErrorActionPreference = "Stop"
$BaseUrl = "https://opendart.fss.or.kr/api"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Normalize-Date([string]$Value) {
  return ($Value -replace "-", "").Trim()
}

function ConvertTo-DartDate([string]$Value) {
  return [datetime]::ParseExact((Normalize-Date $Value), "yyyyMMdd", [Globalization.CultureInfo]::InvariantCulture)
}

function Get-DateChunks([string]$Bgn, [string]$End) {
  $start = ConvertTo-DartDate $Bgn
  $finish = ConvertTo-DartDate $End
  $chunks = @()
  $chunkEnd = $finish
  while ($chunkEnd -ge $start) {
    $chunkStart = $chunkEnd.AddMonths(-3).AddDays(1)
    if ($chunkStart -lt $start) { $chunkStart = $start }
    $chunks += [pscustomobject]@{
      bgn = $chunkStart.ToString("yyyyMMdd")
      end = $chunkEnd.ToString("yyyyMMdd")
    }
    $chunkEnd = $chunkStart.AddDays(-1)
  }
  return @($chunks)
}

function Invoke-DartJson([string]$Path, [hashtable]$Params) {
  $queryString = ($Params.GetEnumerator() | ForEach-Object {
    "{0}={1}" -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value)
  }) -join "&"
  $uri = "$BaseUrl/$Path`?$queryString"
  $response = $null
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try {
      $response = Invoke-RestMethod -Uri $uri -Headers @{ "User-Agent" = "dart-disclosure-signals/1.0" } -TimeoutSec 60
      break
    } catch {
      if ($attempt -eq 4) { break }
      $delay = 2 * $attempt
      Write-Host "DART API request failed (attempt $attempt/4). Retrying in $delay seconds." -ForegroundColor Yellow
      Start-Sleep -Seconds $delay
    }
  }
  if (-not $response) {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { $curl = Get-Command curl -ErrorAction SilentlyContinue }
    if (-not $curl) { throw "DART API request failed and curl is unavailable." }
    $raw = & $curl.Source -fsSL --retry 4 --retry-all-errors --connect-timeout 20 --max-time 60 -A "dart-disclosure-signals/1.0" $uri
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
      throw "DART API curl fallback failed with exit code $LASTEXITCODE"
    }
    $response = $raw | ConvertFrom-Json
  }
  if ($response.status -ne "000" -and $response.status -ne "013") {
    throw "DART API 오류 $($response.status): $($response.message)"
  }
  return $response
}

function Get-DisclosureType([string]$ReportName) {
  $name = [string]$ReportName
  if ($name -like "*해지*") { return "" }
  if ($name -like "*단일판매*" -or $name -like "*공급계약*") { return "contract" }
  if (($name -like "*영업*" -and $name -like "*실적*") -or $name -like "*잠정실적*" -or $name -like "*매출액또는손익구조*") { return "earnings" }
  return ""
}

function Get-RecentDisclosures([string]$Key, [string]$Bgn, [string]$End, [int]$SearchPages, [int]$CandidateLimit) {
  $disclosureTypes = @("I", "B")
  $chunks = Get-DateChunks -Bgn $Bgn -End $End
  $all = @()
  $seen = @{}
  foreach ($chunk in $chunks) {
    foreach ($disclosureType in $disclosureTypes) {
      $page = 1
      while ($page -le $SearchPages -and $all.Count -lt $CandidateLimit) {
        Write-Host "실적/계약 공시검색: $($chunk.bgn)~$($chunk.end) / 유형 $disclosureType / $page 페이지"
        $data = Invoke-DartJson -Path "list.json" -Params @{
          crtfc_key = $Key
          bgn_de = $chunk.bgn
          end_de = $chunk.end
          page_no = $page
          page_count = 100
          pblntf_ty = $disclosureType
          sort = "date"
          sort_mth = "desc"
        }
        if ($data.status -eq "013") { break }
        foreach ($item in @($data.list)) {
          if ($seen.ContainsKey([string]$item.rcept_no)) { continue }
          $type = Get-DisclosureType ([string]$item.report_nm)
          if (($item.corp_cls -eq "Y" -or $item.corp_cls -eq "K") -and $type) {
            $seen[[string]$item.rcept_no] = $true
            $item | Add-Member -NotePropertyName signal_type -NotePropertyValue $type -Force
            $all += $item
            if ($all.Count -ge $CandidateLimit) { break }
          }
        }
        if ($page -ge [int]$data.total_page) { break }
        $page += 1
      }
      if ($all.Count -ge $CandidateLimit) { break }
    }
    if ($all.Count -ge $CandidateLimit) { break }
  }
  return @($all)
}

function Get-DocumentText([string]$Key, [string]$RceptNo, [string]$Dir) {
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  $docDir = Join-Path $Dir $RceptNo
  $textPath = Join-Path $docDir "document.txt"
  if (Test-Path -LiteralPath $textPath) {
    return Get-Content -LiteralPath $textPath -Raw -Encoding UTF8
  }

  New-Item -ItemType Directory -Force -Path $docDir | Out-Null
  $zipPath = Join-Path $docDir "document.zip"
  $uri = "$BaseUrl/document.xml?crtfc_key=$([uri]::EscapeDataString($Key))&rcept_no=$([uri]::EscapeDataString($RceptNo))"
  try {
    Invoke-WebRequest -Uri $uri -OutFile $zipPath -Headers @{ "User-Agent" = "dart-disclosure-signals/1.0" } -TimeoutSec 90
  }
  catch {
    Write-Warning "Invoke-WebRequest failed; retrying DART document with curl: $($_.Exception.Message)"
    $curl = Get-Command curl -ErrorAction SilentlyContinue
    if (-not $curl) { throw }
    & $curl.Source -fsSL --retry 4 --retry-delay 2 --retry-all-errors -A "dart-disclosure-signals/1.0" -o $zipPath $uri
    if ($LASTEXITCODE -ne 0) { throw "curl failed to download DART document $RceptNo (exit $LASTEXITCODE)" }
  }
  if (-not (Test-Path -LiteralPath $zipPath) -or (Get-Item -LiteralPath $zipPath).Length -lt 100) {
    throw "DART document archive is missing or empty: $RceptNo"
  }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $docDir -Force

  $raw = ""
  foreach ($file in Get-ChildItem -LiteralPath $docDir -File | Where-Object { $_.Extension -match "\.(xml|html|htm|txt)$" }) {
    $raw += "`n" + (Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8)
  }
  $decoded = [System.Net.WebUtility]::HtmlDecode($raw)
  $plain = $decoded -replace "<[^>]+>", " "
  $plain = $plain -replace "[`r`n`t]+", " "
  $plain = $plain -replace "\s{2,}", " "
  Set-Content -LiteralPath $textPath -Value $plain -Encoding UTF8
  return $plain
}

function Convert-ToNumber([string]$Value) {
  if (-not $Value) { return $null }
  $text = $Value.Replace(",", "").Replace("%", "").Trim()
  $parsed = 0.0
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
    return $parsed
  }
  return $null
}

function Get-NumberAfter([string]$Text, [string[]]$Labels) {
  foreach ($label in $Labels) {
    $idx = 0
    while ($idx -lt $Text.Length) {
      $found = $Text.IndexOf($label, $idx, [StringComparison]::OrdinalIgnoreCase)
      if ($found -lt 0) { break }
      $chunk = $Text.Substring($found + $label.Length, [Math]::Min(220, $Text.Length - ($found + $label.Length)))
      $match = [regex]::Match($chunk, "[-+]?\d[\d,]*(?:\.\d+)?")
      if ($match.Success) {
        $value = Convert-ToNumber $match.Value
        if ($null -ne $value) { return $value }
      }
      $idx = $found + $label.Length
    }
  }
  return $null
}

function Get-NumberAfterInRange([string]$Text, [string[]]$Labels, [double]$Minimum, [double]$Maximum) {
  foreach ($label in $Labels) {
    $idx = 0
    while ($idx -lt $Text.Length) {
      $found = $Text.IndexOf($label, $idx, [StringComparison]::OrdinalIgnoreCase)
      if ($found -lt 0) { break }
      $start = $found + $label.Length
      $chunk = $Text.Substring($start, [Math]::Min(260, $Text.Length - $start))
      foreach ($match in [regex]::Matches($chunk, "[-+]?\d[\d,]*(?:\.\d+)?")) {
        $value = Convert-ToNumber $match.Value
        if ($null -ne $value -and $value -ge $Minimum -and $value -le $Maximum) { return $value }
      }
      $idx = $start
    }
  }
  return $null
}

function Get-PrimaryContractText([string]$Text) {
  if (-not $Text) { return "" }
  $patterns = @(
    "단일판매ㆍ공급계약 체결 1\. 판매",
    "단일판매·공급계약 체결 1\. 판매",
    "- 단일판매ㆍ공급계약 체결 1\. 판매",
    "- 단일판매·공급계약 체결 1\. 판매"
  )
  foreach ($pattern in $patterns) {
    $matches = [regex]::Matches($Text, $pattern)
    if ($matches.Count -gt 0) {
      $idx = $matches[$matches.Count - 1].Index
      return $Text.Substring($idx)
    }
  }
  $idx = $Text.LastIndexOf("2. 계약내역", [StringComparison]::OrdinalIgnoreCase)
  if ($idx -ge 0) { return $Text.Substring($idx) }
  return $Text
}

function Get-SaneContractAmount($Value) {
  if ($null -eq $Value) { return $null }
  $number = Convert-ToNumber $Value
  if ($null -eq $number -or $number -le 0 -or $number -lt 1000000) { return $null }
  return $number
}

function Get-SaneSalesRatio($Value) {
  if ($null -eq $Value) { return $null }
  $number = Convert-ToNumber $Value
  if ($null -eq $number -or $number -lt 0 -or $number -gt 10000) { return $null }
  return $number
}

function Get-VerifiedRecentSales($ContractAmount, $SalesRatio, $RawRecentSales) {
  $recentSales = Get-SaneContractAmount $RawRecentSales
  if ($ContractAmount -and $SalesRatio -and $SalesRatio -gt 0) {
    $inferred = $ContractAmount / ($SalesRatio / 100)
    if ($null -eq $recentSales) { return [math]::Round($inferred, 0) }
    $gap = [math]::Abs($recentSales - $inferred) / [math]::Max($inferred, 1)
    if ($gap -gt 0.15) { return [math]::Round($inferred, 0) }
    return $recentSales
  }
  if (-not $ContractAmount) { return $null }
  return $recentSales
}

function Normalize-FieldValue([string]$Value) {
  if (-not $Value) { return "" }
  $clean = $Value -replace "\s{2,}", " "
  $clean = $clean.Trim(" `t`r`n-:ㆍ")
  if ($clean -eq "-" -or $clean -eq "해당사항 없음") { return "" }
  return $clean.Trim()
}

function Normalize-CounterpartyValue([string]$Value) {
  $clean = Normalize-FieldValue $Value
  if (-not $clean) { return "" }
  if ($clean.Length -gt 80) { return "" }
  if ($clean -match "재공시|사업개요|기타 투자판단|공시유보|협의") { return "" }
  return $clean
}

function Get-TextBetweenLabels([string]$Text, [string[]]$StartLabels, [string[]]$EndLabels, [int]$MaxLength = 260) {
  if (-not $Text) { return "" }
  foreach ($label in $StartLabels) {
    $idx = $Text.IndexOf($label, [StringComparison]::OrdinalIgnoreCase)
    if ($idx -lt 0) { continue }
    $start = $idx + $label.Length
    $remaining = $Text.Substring($start, [Math]::Min($MaxLength, $Text.Length - $start))
    $endAt = $remaining.Length
    foreach ($endLabel in $EndLabels) {
      $candidate = $remaining.IndexOf($endLabel, [StringComparison]::OrdinalIgnoreCase)
      if ($candidate -ge 0 -and $candidate -lt $endAt) { $endAt = $candidate }
    }
    $value = Normalize-FieldValue $remaining.Substring(0, $endAt)
    if ($value) { return $value }
  }
  return ""
}

function Get-FirstRegexGroup([string]$Text, [string]$Pattern) {
  if (-not $Text) { return "" }
  $match = [regex]::Match($Text, $Pattern)
  if ($match.Success -and $match.Groups.Count -gt 1) {
    return Normalize-FieldValue $match.Groups[1].Value
  }
  return ""
}

function Get-ContractFields([string]$Text) {
  $content = Get-TextBetweenLabels $Text @("판매ㆍ공급계약 내용", "판매·공급계약 내용", "체결계약명", "계약명") @("2. 계약내역", "2. 계약 내용", "계약내역", "계약금액", "조건부 계약여부") 360
  $counterparty = Normalize-CounterpartyValue (Get-TextBetweenLabels $Text @("계약상대방", "계약상대") @("- 최근", "- 주요사업", "- 회사와", "4. 판매", "5. 계약기간", "계약기간", "판매ㆍ공급지역", "판매·공급지역") 260)
  $region = Get-TextBetweenLabels $Text @("판매ㆍ공급지역", "판매·공급지역", "공급지역") @("5. 계약기간", "6. 주요", "계약기간", "계약(수주)일자") 180
  $startDate = Get-FirstRegexGroup $Text "계약기간\s*시작일\s*([0-9]{4}[-.][0-9]{2}[-.][0-9]{2})"
  $endDate = Get-FirstRegexGroup $Text "계약기간\s*시작일\s*[0-9]{4}[-.][0-9]{2}[-.][0-9]{2}\s*종료일\s*([0-9]{4}[-.][0-9]{2}[-.][0-9]{2})"
  if (-not $startDate) { $startDate = Get-FirstRegexGroup $Text "시작일\s*([0-9]{4}[-.][0-9]{2}[-.][0-9]{2})" }
  if (-not $endDate) { $endDate = Get-FirstRegexGroup $Text "종료일\s*([0-9]{4}[-.][0-9]{2}[-.][0-9]{2})" }
  $period = ""
  if ($startDate -and $endDate) { $period = "$startDate ~ $endDate" }
  elseif ($startDate) { $period = "$startDate ~" }
  elseif ($endDate) { $period = "~ $endDate" }
  else {
    $relativePeriod = Get-FirstRegexGroup $Text "계약기간은\s*(.{2,80}?)(?:임|입니다|\.|\s-\s상기)"
    if ($relativePeriod) { $period = $relativePeriod }
  }

  return [pscustomobject]@{
    계약내용 = $content
    계약상대방 = $counterparty
    판매공급지역 = $region
    계약기간 = $period
    계약시작일 = $startDate
    계약종료일 = $endDate
  }
}
function Get-TurnaroundFlag([string]$Text) {
  if ($Text -match "흑자\s*전환|흑자전환") { return "흑자전환" }
  if ($Text -match "적자\s*전환|적자전환") { return "적자전환" }
  if ($Text -match "영업이익.{0,80}증가") { return "영업이익 증가" }
  return ""
}

function New-DisclosureRow($Item, [string]$Text) {
  $type = [string]$Item.signal_type
  $contractAmount = $null
  $recentSales = $null
  $salesRatio = $null
  $sales = $null
  $operatingProfit = $null
  $netProfit = $null
  $turnaround = ""
  $contractFields = $null

  if ($type -eq "contract") {
    $primaryText = Get-PrimaryContractText $Text
    $contractAmount = Get-SaneContractAmount (Get-NumberAfterInRange $primaryText @("계약금액", "계약 금액", "총 계약금액") 1000000 1000000000000000)
    $salesRatio = Get-SaneSalesRatio (Get-NumberAfter $primaryText @("매출액대비", "매출액 대비", "최근매출액대비", "최근 매출액 대비"))
    $recentSales = Get-VerifiedRecentSales $contractAmount $salesRatio (Get-NumberAfter $primaryText @("최근매출액", "최근 매출액"))
    $contractFields = Get-ContractFields $primaryText
    if ($null -eq $salesRatio -and $contractAmount -and $recentSales -and $recentSales -ne 0) {
      $salesRatio = [math]::Round(($contractAmount / $recentSales) * 100, 2)
    }
  }
  elseif ($type -eq "earnings") {
    $sales = Get-NumberAfter $Text @("매출액", "매출")
    $operatingProfit = Get-NumberAfter $Text @("영업이익", "영업 이익")
    $netProfit = Get-NumberAfter $Text @("당기순이익", "당기 순이익", "순이익")
    $turnaround = Get-TurnaroundFlag $Text
  }

  return [pscustomobject]@{
    접수일 = Normalize-Date ([string]$Item.rcept_dt)
    시장 = $(if ($Item.corp_cls -eq "Y") { "KOSPI" } elseif ($Item.corp_cls -eq "K") { "KOSDAQ" } else { "" })
    공시유형 = $(if ($type -eq "contract") { "단일판매·공급계약" } else { "영업실적" })
    종목명 = [string]$Item.corp_name
    종목코드 = [string]$Item.stock_code
    보고서명 = [string]$Item.report_nm
    계약금액 = $contractAmount
    최근매출액 = $recentSales
    매출대비비율 = $salesRatio
    계약상대방 = $(if ($contractFields) { $contractFields.계약상대방 } else { "" })
    계약기간 = $(if ($contractFields) { $contractFields.계약기간 } else { "" })
    계약시작일 = $(if ($contractFields) { $contractFields.계약시작일 } else { "" })
    계약종료일 = $(if ($contractFields) { $contractFields.계약종료일 } else { "" })
    계약내용 = $(if ($contractFields) { $contractFields.계약내용 } else { "" })
    판매공급지역 = $(if ($contractFields) { $contractFields.판매공급지역 } else { "" })
    매출액 = $sales
    영업이익 = $operatingProfit
    당기순이익 = $netProfit
    턴어라운드 = $turnaround
    접수번호 = [string]$Item.rcept_no
    DART_URL = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=$($Item.rcept_no)"
  }
}

if (-not $ApiKey) {
  throw "DART API key is missing. Pass -ApiKey or set `$env:DART_API_KEY."
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$bgn = Normalize-Date $BgnDe
$end = Normalize-Date $EndDe
$reports = Get-RecentDisclosures -Key $ApiKey -Bgn $bgn -End $end -SearchPages $MaxSearchPages -CandidateLimit $MaxCandidates
$rows = @()
$count = 0
$parseFailures = 0
foreach ($report in @($reports | Sort-Object rcept_dt -Descending)) {
  $count += 1
  if ($count -gt $MaxDocuments) {
    $rows += New-DisclosureRow -Item $report -Text ""
    continue
  }
  if ($SkipDocumentParsing) {
    $rows += New-DisclosureRow -Item $report -Text ""
    continue
  }
  Write-Host "공시 원문 파싱: $count/$([Math]::Min($reports.Count, $MaxDocuments)) $($report.corp_name) $($report.report_nm)"
  try {
    $text = Get-DocumentText -Key $ApiKey -RceptNo ([string]$report.rcept_no) -Dir $CacheDir
    $rows += New-DisclosureRow -Item $report -Text $text
  }
  catch {
    $parseFailures += 1
    Write-Warning "원문 파싱 실패: $($report.rcept_no) $($_.Exception.Message)"
    $rows += New-DisclosureRow -Item $report -Text ""
  }
}

$rows = @($rows | Sort-Object 접수일, 종목명 -Descending)
$incompleteContracts = @($rows | Where-Object {
  $_.공시유형 -eq "단일판매·공급계약" -and
  ($null -eq $_.계약금액 -or [double]$_.계약금액 -le 0 -or $null -eq $_.매출대비비율 -or [double]$_.매출대비비율 -lt 0)
})
foreach ($row in $incompleteContracts) {
  Write-Warning "검증 불완전 계약 제외: $($row.종목명) $($row.접수번호)"
}
$rows = @($rows | Where-Object {
  $_.공시유형 -ne "단일판매·공급계약" -or
  ($null -ne $_.계약금액 -and [double]$_.계약금액 -gt 0 -and $null -ne $_.매출대비비율 -and [double]$_.매출대비비율 -ge 0)
})
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $JsonOut) | Out-Null
$payload = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  scope = "KOSPI/KOSDAQ 실적·계약 공시"
  bgnDe = $bgn
  endDe = $end
  totalCandidates = $reports.Count
  parsedDocuments = [Math]::Min($reports.Count, $MaxDocuments)
  parseFailures = $parseFailures
  parseSuccesses = ([Math]::Min($reports.Count, $MaxDocuments) - $parseFailures)
  excludedIncompleteContracts = $incompleteContracts.Count
  maxSearchPages = $MaxSearchPages
  skipDocumentParsing = [bool]$SkipDocumentParsing
  rows = @($rows)
}
$json = $payload | ConvertTo-Json -Depth 6
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($JsonOut), $json, $utf8NoBom)
$jsOut = Join-Path (Split-Path -Parent $JsonOut) "disclosure_signals.js"
[System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($jsOut), ("window.__DISCLOSURE_SIGNALS__ = " + $json + ";"), $utf8NoBom)

Write-Host "실적/계약 공시 데이터: $($rows.Count)건"
Write-Host $JsonOut


