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
  $response = Invoke-RestMethod -Uri $uri -Headers @{ "User-Agent" = "dart-disclosure-signals/1.0" } -TimeoutSec 60
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
  Invoke-WebRequest -Uri $uri -OutFile $zipPath -Headers @{ "User-Agent" = "dart-disclosure-signals/1.0" } -TimeoutSec 90
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
    $idx = $Text.IndexOf($label, [StringComparison]::OrdinalIgnoreCase)
    if ($idx -lt 0) { continue }
    $chunk = $Text.Substring($idx, [Math]::Min(700, $Text.Length - $idx))
    $matches = [regex]::Matches($chunk, "[-+]?\d[\d,]*(?:\.\d+)?")
    foreach ($match in $matches) {
      $value = Convert-ToNumber $match.Value
      if ($null -ne $value) { return $value }
    }
  }
  return $null
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

  if ($type -eq "contract") {
    $contractAmount = Get-NumberAfter $Text @("계약금액", "계약 금액", "총 계약금액")
    $recentSales = Get-NumberAfter $Text @("최근매출액", "최근 매출액")
    $salesRatio = Get-NumberAfter $Text @("매출액대비", "매출액 대비", "최근매출액대비", "최근 매출액 대비")
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
    Write-Warning "원문 파싱 실패: $($report.rcept_no) $($_.Exception.Message)"
    $rows += New-DisclosureRow -Item $report -Text ""
  }
}

$rows = @($rows | Sort-Object 접수일, 종목명 -Descending)
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $JsonOut) | Out-Null
$payload = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  scope = "KOSPI/KOSDAQ 실적·계약 공시"
  bgnDe = $bgn
  endDe = $end
  totalCandidates = $reports.Count
  parsedDocuments = [Math]::Min($reports.Count, $MaxDocuments)
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
