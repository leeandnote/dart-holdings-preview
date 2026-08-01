param(
  [string]$ApiKey = $env:DART_API_KEY,
  [string]$LatestJson = "site\data\latest.json",
  [string]$JsonOut = "site\data\shareholders.json",
  [int]$MaxStocks = 180,
  [int]$SleepMs = 80
)

$ErrorActionPreference = "Stop"
$BaseUrl = "https://opendart.fss.or.kr/api"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not $ApiKey) {
  throw "DART API key is missing. Pass -ApiKey or set DART_API_KEY."
}
if (-not (Test-Path -LiteralPath $LatestJson)) {
  throw "latest.json not found: $LatestJson"
}

function Invoke-DartJson([string]$Path, [hashtable]$Params) {
  $queryString = ($Params.GetEnumerator() | ForEach-Object {
    "{0}={1}" -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value)
  }) -join "&"
  $uri = "$BaseUrl/$Path`?$queryString"
  $response = Invoke-RestMethod -Uri $uri -Headers @{ "User-Agent" = "leeandnote-dart-monitor/1.0" } -TimeoutSec 60
  if ($response.status -ne "000" -and $response.status -ne "013") {
    throw "DART API error $($response.status): $($response.message)"
  }
  return $response
}

function Get-CorpCodeXml([string]$Key) {
  $cacheDir = ".cache"
  New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
  $xmlPath = Join-Path $cacheDir "CORPCODE.xml"
  if (Test-Path -LiteralPath $xmlPath) { return $xmlPath }

  $zipPath = Join-Path $cacheDir "corpCode.zip"
  Invoke-WebRequest -Uri "$BaseUrl/corpCode.xml?crtfc_key=$([uri]::EscapeDataString($Key))" -OutFile $zipPath -Headers @{ "User-Agent" = "leeandnote-dart-monitor/1.0" } -TimeoutSec 90
  Expand-Archive -LiteralPath $zipPath -DestinationPath $cacheDir -Force
  return $xmlPath
}

function Convert-ToNumber($Value) {
  if ($null -eq $Value) { return $null }
  $text = ([string]$Value).Replace(",", "").Replace("%", "").Trim()
  if ($text -eq "" -or $text -eq "-") { return $null }
  $parsed = 0.0
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
    return $parsed
  }
  return $null
}

function Get-PropValue($Obj, [string]$Name) {
  if ($null -eq $Obj) { return $null }
  $prop = $Obj.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $null }
  return $prop.Value
}

$latest = Get-Content -LiteralPath $LatestJson -Raw -Encoding UTF8 | ConvertFrom-Json

$colStockCode = -join ([char[]](0xC885, 0xBAA9, 0xCF54, 0xB4DC))
$colCorpName = -join ([char[]](0xC885, 0xBAA9, 0xBA85))
$colReceiptDate = -join ([char[]](0xC811, 0xC218, 0xC77C))

[xml]$corpXml = Get-Content -LiteralPath (Get-CorpCodeXml -Key $ApiKey) -Encoding UTF8
$corpByStock = @{}
foreach ($item in @($corpXml.result.list | Where-Object { $_.stock_code -and $_.stock_code.Trim() -ne "" })) {
  $corpByStock[$item.stock_code.Trim()] = $item
}

$stocks = @($latest.rows |
  Group-Object -Property $colStockCode |
  ForEach-Object {
    $latestRow = @($_.Group | Sort-Object -Property $colReceiptDate -Descending | Select-Object -First 1)[0]
    [pscustomobject]@{
      stockCode = [string]$_.Name
      corpName = [string](Get-PropValue $latestRow $colCorpName)
      latestDate = [string](Get-PropValue $latestRow $colReceiptDate)
    }
  } |
  Sort-Object -Property @{ Expression = "latestDate"; Descending = $true }, @{ Expression = "corpName"; Descending = $false } |
  Select-Object -First $MaxStocks)

$year = (Get-Date).Year
$reportPlan = @(
  @{ year = $year; code = "11013"; name = "1Q report" },
  @{ year = $year; code = "11012"; name = "Half-year report" },
  @{ year = $year; code = "11014"; name = "3Q report" },
  @{ year = $year; code = "11011"; name = "Annual report" },
  @{ year = $year - 1; code = "11011"; name = "Annual report" },
  @{ year = $year - 1; code = "11014"; name = "3Q report" },
  @{ year = $year - 1; code = "11012"; name = "Half-year report" },
  @{ year = $year - 1; code = "11013"; name = "1Q report" }
)

$result = @{}
$index = 0
foreach ($stock in $stocks) {
  $index += 1
  if (-not $corpByStock.ContainsKey($stock.stockCode)) { continue }
  $corp = $corpByStock[$stock.stockCode]
  Write-Host "Regular shareholder snapshot: $index/$($stocks.Count) $($stock.corpName)($($stock.stockCode))"

  foreach ($plan in $reportPlan) {
    Start-Sleep -Milliseconds $SleepMs
    $res = Invoke-DartJson -Path "hyslrSttus.json" -Params @{
      crtfc_key = $ApiKey
      corp_code = [string]$corp.corp_code
      bsns_year = [string]$plan.year
      reprt_code = [string]$plan.code
    }
    if ($res.status -eq "013" -or -not $res.list) { continue }

    $rows = @($res.list | ForEach-Object {
      [pscustomobject]@{
        name = [string]$_.nm
        relation = [string]$_.relate
        stockKind = [string]$_.stock_knd
        shares = Convert-ToNumber $_.trmend_posesn_stock_co
        ratio = Convert-ToNumber $_.trmend_posesn_stock_qota_rt
        basisShares = Convert-ToNumber $_.bsis_posesn_stock_co
        basisRatio = Convert-ToNumber $_.bsis_posesn_stock_qota_rt
        note = [string]$_.rm
      }
    } | Where-Object { $null -ne $_.ratio -or $null -ne $_.shares } | Sort-Object ratio -Descending | Select-Object -First 12)

    if ($rows.Count -gt 0) {
      $first = @($res.list)[0]
      $result[$stock.stockCode] = [pscustomobject]@{
        corpName = $stock.corpName
        stockCode = $stock.stockCode
        reportYear = [string]$plan.year
        reportCode = [string]$plan.code
        reportName = "$($plan.year) $($plan.name)"
        settlementDate = [string]$first.stlm_dt
        rceptNo = [string]$first.rcept_no
        sourceUrl = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=$($first.rcept_no)"
        rows = $rows
      }
      break
    }
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $JsonOut) | Out-Null
$payload = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  source = "DART hyslrSttus regular reports"
  maxStocks = $MaxStocks
  data = $result
}
$json = $payload | ConvertTo-Json -Depth 12
Set-Content -LiteralPath $JsonOut -Value $json -Encoding UTF8
$jsPath = [IO.Path]::ChangeExtension($JsonOut, ".js")
Set-Content -LiteralPath $jsPath -Value ("window.__REGULAR_SHAREHOLDERS__ = " + ($result | ConvertTo-Json -Depth 12) + ";") -Encoding UTF8
Write-Host "Saved regular shareholder cache: $JsonOut"
