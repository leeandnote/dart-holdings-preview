param(
  [int]$PublicDays = 90
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Site = Join-Path $Root 'site'
$Dist = Join-Path $Root 'public_dist'
$Deploy = Join-Path $Root 'deploy'
$ZipPath = Join-Path $Deploy 'leeandnote-cloudflare-pages.zip'

function Get-FirstValue($Obj, [string[]]$Names) {
  foreach ($name in $Names) {
    $prop = $Obj.PSObject.Properties[$name]
    if ($prop -and $null -ne $prop.Value -and [string]$prop.Value -ne '') {
      return [string]$prop.Value
    }
  }
  return ''
}

if (!(Test-Path -LiteralPath $Site)) {
  throw "site folder not found: $Site"
}

$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
if (Test-Path -LiteralPath $Dist) {
  $resolvedDist = (Resolve-Path -LiteralPath $Dist).Path
  if (!$resolvedDist.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete outside project: $resolvedDist"
  }
  Remove-Item -LiteralPath $Dist -Recurse -Force
}
if (!(Test-Path -LiteralPath $Deploy)) {
  New-Item -ItemType Directory -Path $Deploy -Force | Out-Null
}
if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

Copy-Item -LiteralPath $Site -Destination $Dist -Recurse -Force

$latestJson = Join-Path $Site 'data\latest.json'
if (Test-Path -LiteralPath $latestJson) {
  $data = Get-Content -LiteralPath $latestJson -Raw -Encoding UTF8 | ConvertFrom-Json
  $rows = @($data.rows)
  $dateNames = @('접수일', 'date', 'reportDate', '접수일자')
  $codeNames = @('종목코드', 'stockCode', 'code')
  $maxDateText = ($rows | ForEach-Object { Get-FirstValue $_ $dateNames } | Where-Object { $_ -match '^\d{8}$' } | Sort-Object -Descending | Select-Object -First 1)
  if ($maxDateText) {
    $maxDate = [datetime]::ParseExact($maxDateText, 'yyyyMMdd', [Globalization.CultureInfo]::InvariantCulture)
    $cutoff = $maxDate.AddDays(-1 * $PublicDays).ToString('yyyyMMdd')
    $filteredRows = @($rows | Where-Object {
      $date = Get-FirstValue $_ $dateNames
      $date -match '^\d{8}$' -and $date -ge $cutoff
    })
    $usedCodes = @{}
    foreach ($row in $filteredRows) {
      $code = Get-FirstValue $row $codeNames
      if ($code) { $usedCodes[$code] = $true }
    }
    $filteredCorps = @($data.corps | Where-Object {
      $code = Get-FirstValue $_ $codeNames
      $code -and $usedCodes.ContainsKey($code)
    })
    $data.scope = "KOSPI/KOSDAQ recent $PublicDays days public build"
    $data.bgnDe = $cutoff
    $data.endDe = $maxDateText
    $data.rows = $filteredRows
    $data.corps = $filteredCorps
    Write-Host "PUBLIC_DATA_ROWS=$($filteredRows.Count)"
    Write-Host "PUBLIC_DATA_RANGE=$cutoff-$maxDateText"
  }
  $dataDir = Join-Path $Dist 'data'
  $jsonText = $data | ConvertTo-Json -Depth 20 -Compress
  Set-Content -LiteralPath (Join-Path $dataDir 'latest.json') -Value $jsonText -Encoding UTF8
  Set-Content -LiteralPath (Join-Path $dataDir 'latest.js') -Value ("window.__DART_DATA__ = $jsonText;") -Encoding UTF8
}

$files = Get-ChildItem -LiteralPath $Dist -Recurse -File -Force
$tooLarge = @($files | Where-Object { $_.Length -gt 25MB })
if ($tooLarge.Count -gt 0) {
  Write-Host 'ERROR: Cloudflare Pages single-file 25MiB limit exceeded.'
  $tooLarge | Select-Object FullName,Length | Format-Table -AutoSize
  exit 1
}
if ($files.Count -gt 20000) {
  Write-Host "ERROR: Cloudflare Pages Free file-count limit exceeded: $($files.Count)"
  exit 1
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($Dist.Length).TrimStart('\') -replace '\\','/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}

$distSize = ($files | Measure-Object -Property Length -Sum).Sum
Write-Host "PUBLIC_DIST=$Dist"
Write-Host "DEPLOY_ZIP=$ZipPath"
Write-Host "FILES=$($files.Count)"
Write-Host "SIZE_MB=$([math]::Round($distSize / 1MB, 2))"
Write-Host "ZIP_MB=$([math]::Round((Get-Item -LiteralPath $ZipPath).Length / 1MB, 2))"
