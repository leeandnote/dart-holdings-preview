param(
  [string]$ApiKey = $env:DART_API_KEY,
  [string]$LatestJson = "site\data\latest.json",
  [string]$JsonOut = "site\data\logos.json",
  [int]$MaxStocks = 260,
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

function Get-PropValue($Obj, [string]$Name) {
  if ($null -eq $Obj) { return $null }
  $prop = $Obj.PSObject.Properties[$Name]
  if ($null -eq $prop) { return $null }
  return $prop.Value
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

function Invoke-DartCompany([string]$CorpCode) {
  $uri = "$BaseUrl/company.json?crtfc_key=$([uri]::EscapeDataString($ApiKey))&corp_code=$([uri]::EscapeDataString($CorpCode))"
  $response = Invoke-RestMethod -Uri $uri -Headers @{ "User-Agent" = "leeandnote-dart-monitor/1.0" } -TimeoutSec 60
  if ($response.status -ne "000" -and $response.status -ne "013") {
    throw "DART API error $($response.status): $($response.message)"
  }
  return $response
}

function Normalize-Homepage([string]$Url) {
  if (-not $Url) { return $null }
  $text = $Url.Trim()
  if ($text -eq "" -or $text -eq "-") { return $null }
  if ($text -notmatch "^https?://") {
    $text = "https://$text"
  }
  try {
    $uri = [uri]$text
    if (-not $uri.Host) { return $null }
    return $uri
  } catch {
    return $null
  }
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

$logos = @{}
$meta = @{}
$index = 0
foreach ($stock in $stocks) {
  $index += 1
  if (-not $corpByStock.ContainsKey($stock.stockCode)) { continue }
  $corp = $corpByStock[$stock.stockCode]
  Write-Host "Company homepage favicon: $index/$($stocks.Count) $($stock.corpName)($($stock.stockCode))"
  Start-Sleep -Milliseconds $SleepMs

  $company = Invoke-DartCompany -CorpCode ([string]$corp.corp_code)
  $homepage = Normalize-Homepage ([string]$company.hm_url)
  if ($homepage) {
    $domain = $homepage.Host.ToLowerInvariant()
    $logos[$stock.stockCode] = "$($homepage.Scheme)://$domain/favicon.ico"
    $meta[$stock.stockCode] = [pscustomobject]@{
      corpName = $stock.corpName
      homepage = $homepage.AbsoluteUri
      domain = $domain
      source = "DART company.hm_url"
    }
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $JsonOut) | Out-Null
$payload = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  source = "DART company overview homepage favicon"
  maxStocks = $MaxStocks
  count = $logos.Count
  logos = $logos
  meta = $meta
}
$payload | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $JsonOut -Encoding UTF8
$jsPath = [IO.Path]::ChangeExtension($JsonOut, ".js")
Set-Content -LiteralPath $jsPath -Value ("window.__STOCK_LOGOS__ = " + ($logos | ConvertTo-Json -Depth 10) + ";") -Encoding UTF8
Write-Host "Saved company logo cache: $JsonOut ($($logos.Count) logos)"
