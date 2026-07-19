param(
  [string]$ApiKey = $env:DART_API_KEY,
  [string]$JsonPath = "site\data\latest.json",
  [string]$JsPath = "site\data\latest.js",
  [string]$CacheDir = ".cache\documents",
  [int]$SleepMs = 80,
  [int]$MaxRows = 0
)

$ErrorActionPreference = "Stop"
$BaseUrl = "https://opendart.fss.or.kr/api"

if (-not $ApiKey) {
  throw "DART API key is required. Set DART_API_KEY or pass -ApiKey."
}

function Get-RowField($row, [int]$index) {
  $props = @($row.PSObject.Properties)
  if ($props.Count -le $index) { return "" }
  $value = $props[$index].Value
  if ($null -eq $value) { return "" }
  return "$value"
}

function Get-ReceiptNo($row) {
  $props = @($row.PSObject.Properties)
  foreach ($prop in $props) {
    if ($prop.Name -eq "접수번호") { return "$($prop.Value)" }
  }
  $value = Get-RowField $row 13
  if ($value -match "^\d{14}$") { return $value }
  $value = Get-RowField $row 14
  if ($value -match "^\d{14}$") { return $value }
  return ""
}

function Get-ReceiptDate($row) {
  $props = @($row.PSObject.Properties)
  foreach ($prop in $props) {
    if ($prop.Name -eq "접수일") { return "$($prop.Value)" }
  }
  $value = Get-RowField $row 0
  if ($value -match "^\d{8}$") { return $value }
  $value = Get-RowField $row 1
  if ($value -match "^\d{8}$") { return $value }
  return ""
}

function Get-DocumentText([string]$RceptNo) {
  New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
  $zipPath = Join-Path $CacheDir "$RceptNo.zip"
  if (!(Test-Path -LiteralPath $zipPath)) {
    $url = "$BaseUrl/document.xml?crtfc_key=$([uri]::EscapeDataString($ApiKey))&rcept_no=$RceptNo"
    Invoke-WebRequest -Uri $url -OutFile $zipPath -TimeoutSec 60 -Headers @{ "User-Agent" = "major-holdings-monitor/1.0" }
    Start-Sleep -Milliseconds $SleepMs
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entry = $zip.Entries | Select-Object -First 1
    if ($null -eq $entry) { return "" }
    $reader = New-Object IO.StreamReader($entry.Open(), [Text.Encoding]::UTF8)
    try {
      return $reader.ReadToEnd()
    } finally {
      $reader.Close()
    }
  } finally {
    $zip.Dispose()
  }
}

function Find-ObligationDate([string]$Text) {
  if (-not $Text) { return "" }
  $match = [regex]::Match($Text, 'AUNIT="RPT_RSP_DT"\s+AUNITVALUE="(?<date>\d{8})"')
  if ($match.Success) { return $match.Groups["date"].Value }
  $match = [regex]::Match($Text, 'AUNITVALUE="(?<date>\d{8})"[^>]*>\s*\d{4}년\s*\d{2}월\s*\d{2}일\s*</TU>')
  if ($match.Success -and $Text.Substring([Math]::Max(0, $match.Index - 220), [Math]::Min(440, $Text.Length - [Math]::Max(0, $match.Index - 220))).Contains("보고의무발생일")) {
    return $match.Groups["date"].Value
  }
  return ""
}

$payload = Get-Content -LiteralPath $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$rows = @($payload.rows)
if ($MaxRows -gt 0) {
  $rows = @($rows | Select-Object -First $MaxRows)
}

$cache = @{}
$index = 0
$updated = 0
$failed = 0

foreach ($row in $rows) {
  $index += 1
  $rceptNo = Get-ReceiptNo $row
  if (-not $rceptNo) { continue }
  if (!$cache.ContainsKey($rceptNo)) {
    try {
      Write-Host "[$index/$($rows.Count)] $rceptNo"
      $text = Get-DocumentText $rceptNo
      $cache[$rceptNo] = Find-ObligationDate $text
    } catch {
      $failed += 1
      $cache[$rceptNo] = ""
    }
  }
  $date = $cache[$rceptNo]
  if (-not $date) {
    $date = Get-ReceiptDate $row
  }
  if ($row.PSObject.Properties.Name -contains "보고의무발생일") {
    $row."보고의무발생일" = $date
  } else {
    $row | Add-Member -NotePropertyName "보고의무발생일" -NotePropertyValue $date
  }
  if ($date -and $date -ne (Get-ReceiptDate $row)) {
    $updated += 1
  }
}

$json = $payload | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $JsonPath -Value $json -Encoding UTF8
Set-Content -LiteralPath $JsPath -Value ("window.__DART_DATA__ = " + $json + ";") -Encoding UTF8

Write-Host "Obligation date enrichment done. different_from_receipt=$updated failed=$failed rows=$($rows.Count)"

