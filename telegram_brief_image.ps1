param(
  [string]$BotToken = $env:TELEGRAM_BOT_TOKEN,
  [string]$ChatId = $env:TELEGRAM_CHAT_ID,
  [string]$DataPath = (Join-Path $PSScriptRoot "site\data\latest.json"),
  [string]$SiteUrl = $env:SITE_URL,
  [string]$ReportDate = "",
  [int]$Top = 5,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function U([string]$Hex) {
  return -join (($Hex -split " ") | Where-Object { $_ } | ForEach-Object { [char][Convert]::ToInt32($_, 16) })
}

function V([object]$Row, [int]$Index) {
  $props = @($Row.PSObject.Properties)
  if ($Index -lt 0 -or $Index -ge $props.Count) { return $null }
  return $props[$Index].Value
}

function N([object]$Value) {
  if ($null -eq $Value) { return $null }
  $text = ([string]$Value).Replace(",", "").Replace("%", "").Trim()
  if (-not $text -or $text -eq "-") { return $null }
  $number = 0.0
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) { return $number }
  return $null
}

function DateText([string]$Value) {
  $digits = ([string]$Value) -replace "\D", ""
  if ($digits.Length -ge 8) { return "$($digits.Substring(0,4))-$($digits.Substring(4,2))-$($digits.Substring(6,2))" }
  return $Value
}

function ShortDate([string]$Value) {
  $digits = ([string]$Value) -replace "\D", ""
  if ($digits.Length -ge 8) { return $digits.Substring(2,6) }
  return $Value
}

function Eok([object]$Value) {
  if ($null -eq $Value) { return "-" }
  $eok = [math]::Round([math]::Abs([double]$Value) / 100000000)
  return "$($eok.ToString('N0'))$($script:W_Eok)"
}

function Cut([string]$Text, [int]$Max) {
  $value = ([string]$Text).Trim()
  if ($value.Length -le $Max) { return $value }
  return "$($value.Substring(0, [Math]::Max(1, $Max - 1)))..."
}

function ReadWindowJson([string]$Path, [string]$Prefix) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $pattern = "^\s*" + [regex]::Escape($Prefix) + "\s*=\s*"
  $json = $raw -replace $pattern, ""
  $json = $json -replace ";\s*$", ""
  return $json | ConvertFrom-Json
}

function PriceItems([string]$Code) {
  $file = Join-Path $script:PriceDir "$Code.js"
  if (-not (Test-Path -LiteralPath $file)) { return @() }
  $raw = Get-Content -LiteralPath $file -Raw -Encoding UTF8
  $match = [regex]::Match($raw, "=\s*(\[.*\]);?\s*$", [Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $match.Success) { return @() }
  return @($match.Groups[1].Value | ConvertFrom-Json)
}

function Spark([array]$Items, [string]$EventDate, [int]$Width, [int]$Height) {
  $items = @($Items | Select-Object -Last 90)
  if ($items.Count -lt 2) { return $null }
  $prices = @($items | ForEach-Object { [double]$_.close })
  $min = ($prices | Measure-Object -Minimum).Minimum
  $max = ($prices | Measure-Object -Maximum).Maximum
  if ($max -eq $min) { $max = $min + 1 }
  $points = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  for ($i = 0; $i -lt $items.Count; $i++) {
    $x = 4 + (($Width - 8) * $i / [Math]::Max(1, $items.Count - 1))
    $y = 4 + (($Height - 8) * (1 - (([double]$items[$i].close - $min) / ($max - $min))))
    $points.Add([System.Drawing.PointF]::new([single]$x, [single]$y))
  }
  $eventIndex = $items.Count - 1
  $digits = ([string]$EventDate) -replace "\D", ""
  if ($digits.Length -eq 8) {
    $eventText = "$($digits.Substring(0,4))-$($digits.Substring(4,2))-$($digits.Substring(6,2))"
    for ($i = 0; $i -lt $items.Count; $i++) {
      if ([string]$items[$i].date -ge $eventText) { $eventIndex = $i; break }
    }
  }
  return [pscustomobject]@{ Points = $points.ToArray(); EventPoint = $points[$eventIndex] }
}

$W_Eok = U "C5B5 C6D0"
$L_Receipt = U "C811 C218 C77C"
$L_Bulk = U "B300 B7C9 BCF4 C720 ACF5 C2DC"
$L_BuyTop = U "B9E4 C218 C131 20 BCC0 B3D9 20 0054 006F 0070"
$L_SellTop = U "B9E4 B3C4 C131 20 BCC0 B3D9 20 0054 006F 0070"
$L_NewTop = U "C2E0 ADDC 20 0035 0025 20 C9C4 C785"
$L_Stock = U "C885 BAA9 BA85"
$L_Holder = U "C8FC C8FC 002F C81C CD9C C778"
$L_Date = U "BCF4 ACE0 C758 BB34 BC1C C0DD C77C"
$L_Amount = U "C9C0 BD84 BCC0 B3D9 AE08 C561"
$L_Ratio = U "C9C0 BD84 BCC0 B3D9 C0AC D56D"
$L_Trend = U "0031 B144 20 CD94 C774"
$L_TitleSuffix = U "C8FC C694 20 C9C0 BD84 BCC0 B3D9 20 ACF5 C2DC 20 C694 C57D"
$L_Case = U "AC74"
$L_Image = U "D45C 20 C774 BBF8 C9C0"

if (-not (Test-Path -LiteralPath $DataPath)) { throw "Data file not found: $DataPath" }
if (-not $SiteUrl) { $SiteUrl = "https://dart-holdings-preview.vercel.app" }
if ($BotToken -and -not $BotToken.StartsWith("bot")) { $BotToken = "bot$BotToken" }

$payload = Get-Content -LiteralPath $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
$rows = @($payload.rows)
if (-not $ReportDate) {
  $ReportDate = ($rows | ForEach-Object { V $_ 1 } | Where-Object { $_ } | Sort-Object -Descending | Select-Object -First 1)
}
$daily = @($rows | Where-Object { (V $_ 1) -eq $ReportDate })
if (-not $daily.Count) {
  Write-Host "No disclosures for $ReportDate. Skipping image notification."
  exit 0
}

$eventPrices = ReadWindowJson -Path (Join-Path $PSScriptRoot "site\data\event_prices.js") -Prefix "window.__EVENT_PRICES__"
$PriceDir = Join-Path $PSScriptRoot "site\data\prices"

$enriched = foreach ($row in $daily) {
  $code = [string](V $row 5)
  $receiptDate = [string](V $row 1)
  $obligationDate = [string](V $row 0)
  if (-not $obligationDate) { $obligationDate = $receiptDate }
  $shareDelta = N (V $row 12)
  $price = $null
  $priceKey = "${code}_${obligationDate}"
  if ($eventPrices -and $eventPrices.PSObject.Properties[$priceKey]) {
    $price = N $eventPrices.PSObject.Properties[$priceKey].Value.close
  }
  $tradeValue = if ($null -ne $price -and $null -ne $shareDelta) { $price * $shareDelta } else { $null }
  [pscustomobject]@{
    CorpName = [string](V $row 4)
    StockCode = $code
    Market = [string](V $row 2)
    Reporter = [string](V $row 6)
    Reason = [string](V $row 13)
    ReceiptDate = $receiptDate
    ObligationDate = $obligationDate
    Previous = N (V $row 7)
    Current = N (V $row 8)
    TradeValue = $tradeValue
    Spark = Spark -Items (PriceItems $code) -EventDate $obligationDate -Width 118 -Height 32
  }
}

$buyRows = @($enriched | Where-Object { $null -ne $_.TradeValue -and $_.TradeValue -gt 0 } | Sort-Object TradeValue -Descending | Select-Object -First $Top)
$sellRows = @($enriched | Where-Object { $null -ne $_.TradeValue -and $_.TradeValue -lt 0 } | Sort-Object @{ Expression = { [math]::Abs($_.TradeValue) }; Descending = $true } | Select-Object -First $Top)
$newRows = @($enriched | Where-Object { $null -ne $_.Previous -and $null -ne $_.Current -and $_.Previous -lt 5 -and $_.Current -ge 5 } | Sort-Object Current -Descending | Select-Object -First $Top)

$width = 860
$rowHeight = 54
$sectionHeader = 44
$topHeight = 132
$gap = 14
$height = $topHeight + (3 * $sectionHeader) + (($buyRows.Count + $sellRows.Count + $newRows.Count) * $rowHeight) + (3 * $gap) + 34
$scale = 2

$bmp = [Drawing.Bitmap]::new($width * $scale, $height * $scale)
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([Drawing.Color]::White)
$g.ScaleTransform($scale, $scale)

$black = [Drawing.Brushes]::Black
$muted = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(95, 108, 126))
$orange = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(250, 73, 5))
$red = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(224, 49, 49))
$blue = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(31, 111, 235))
$linePen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(216, 224, 235), 1)
$navyPen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(17, 24, 39), 2)
$orangePen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(250, 73, 5), 4)
$bluePen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(31, 111, 235), 4)
$darkPen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(17, 24, 39), 4)
$sparkRedPen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(224, 49, 49), 2)
$sparkBluePen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(31, 111, 235), 2)
$dashPen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(198, 205, 216), 1)
$dashPen.DashStyle = [Drawing.Drawing2D.DashStyle]::Dash

$fontBrand = [Drawing.Font]::new("Arial", 9.5, [Drawing.FontStyle]::Bold)
$fontTitle = [Drawing.Font]::new("Malgun Gothic", 20, [Drawing.FontStyle]::Bold)
$fontHead = [Drawing.Font]::new("Malgun Gothic", 14, [Drawing.FontStyle]::Bold)
$fontSmall = [Drawing.Font]::new("Malgun Gothic", 8.5, [Drawing.FontStyle]::Regular)
$fontSmallBold = [Drawing.Font]::new("Malgun Gothic", 8.5, [Drawing.FontStyle]::Bold)
$fontBody = [Drawing.Font]::new("Malgun Gothic", 10, [Drawing.FontStyle]::Bold)
$fontSub = [Drawing.Font]::new("Malgun Gothic", 7.5, [Drawing.FontStyle]::Regular)

$g.DrawLine($orangePen, 34, 24, 360, 24)
$g.DrawLine($darkPen, 360, 24, $width - 34, 24)
$g.DrawString("LEE&NOTE DISCLOSURE BRIEF", $fontBrand, $orange, 34, 48)
$titleText = "[" + (ShortDate $ReportDate) + " " + $L_TitleSuffix + "]"
$subtitleText = $L_Receipt + " " + (DateText $ReportDate) + " - " + $L_Bulk + " " + $daily.Count + $L_Case
$g.DrawString($titleText, $fontTitle, $black, 34, 72)
$g.DrawString($subtitleText, $fontSmall, $muted, 36, 112)

function DrawSection([string]$Title, [array]$Rows, [Drawing.Brush]$AmountBrush, [Drawing.Pen]$TopPen, [Drawing.Pen]$SparkPen, [int]$Y) {
  $g.DrawLine($TopPen, 34, $Y, $width - 34, $Y)
  $g.DrawString($Title, $fontHead, $black, 34, $Y + 12)
  $g.DrawString("Top $($Rows.Count)", $fontSmallBold, $muted, $width - 74, $Y + 18)
  $y = $Y + $sectionHeader
  $headers = @("#", $L_Stock, $L_Holder, $L_Date, $L_Amount, $L_Ratio, $L_Trend)
  $xs = @(42, 75, 195, 366, 486, 590, 710)
  for ($i = 0; $i -lt $headers.Count; $i++) { $g.DrawString($headers[$i], $fontSub, $muted, $xs[$i], $y) }
  $g.DrawLine($navyPen, 34, $y + 18, $width - 34, $y + 18)
  $y += 22
  $rank = 1
  foreach ($row in $Rows) {
    $g.DrawString([string]$rank, $fontBody, $muted, 45, $y + 12)
    $g.DrawString((Cut $row.CorpName 12), $fontBody, $black, 75, $y + 5)
    $g.DrawString("$($row.StockCode) - $($row.Market)", $fontSub, $muted, 75, $y + 25)
    $g.DrawString((Cut $row.Reporter 18), $fontBody, $black, 195, $y + 5)
    $g.DrawString((Cut $row.Reason 24), $fontSub, $muted, 195, $y + 25)
    $g.DrawString((DateText $row.ObligationDate), $fontBody, $black, 366, $y + 5)
    $g.DrawString("$L_Receipt $(DateText $row.ReceiptDate)", $fontSub, $muted, 366, $y + 25)
    $arrow = if ($row.TradeValue -lt 0) { [string][char]0x25BC } else { [string][char]0x25B2 }
    $g.DrawString("$arrow$(Eok $row.TradeValue)", $fontBody, $AmountBrush, 486, $y + 13)
    $ratio = if ($null -ne $row.Previous -and $null -ne $row.Current) { "{0:N2}% -> {1:N2}%" -f $row.Previous, $row.Current } else { "-" }
    $g.DrawString($ratio, $fontBody, $black, 590, $y + 13)
    if ($row.Spark) {
      $sparkX = 710
      $sparkY = $y + 8
      $g.DrawLine($dashPen, $sparkX, $sparkY + 24, $sparkX + 118, $sparkY + 24)
      $pts = @($row.Spark.Points | ForEach-Object { [Drawing.PointF]::new($_.X + $sparkX, $_.Y + $sparkY) })
      if ($pts.Count -gt 1) { $g.DrawLines($SparkPen, $pts) }
      $pt = $row.Spark.EventPoint
      $g.FillEllipse([Drawing.Brushes]::Black, $sparkX + $pt.X - 3, $sparkY + $pt.Y - 3, 6, 6)
    }
    $g.DrawLine($linePen, 34, $y + $rowHeight - 1, $width - 34, $y + $rowHeight - 1)
    $rank += 1
    $y += $rowHeight
  }
  if (-not $Rows.Count) {
    $g.DrawString("No data", $fontSmall, $muted, 42, $y + 12)
    $y += $rowHeight
  }
  return $y + $gap
}

$y = $topHeight
$y = DrawSection $L_BuyTop $buyRows $red $orangePen $sparkRedPen $y
$y = DrawSection $L_SellTop $sellRows $blue $bluePen $sparkBluePen $y
$y = DrawSection $L_NewTop $newRows $red $darkPen $sparkRedPen $y

$outDir = Join-Path $PSScriptRoot ".cache\telegram_reports"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$imagePath = Join-Path $outDir "leeandnote_brief_$ReportDate.png"
$bmp.Save($imagePath, [Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

if ($DryRun) {
  Write-Host "Telegram image generated: $imagePath"
  exit 0
}

if (-not $BotToken -or -not $ChatId) {
  Write-Host "Telegram credentials not configured. Skipping image notification."
  exit 0
}

$caption = "[" + (ShortDate $ReportDate) + " " + $L_TitleSuffix + "] " + $L_Image
$sendPhotoUrl = "https://api.telegram.org/$BotToken/sendPhoto"

$uploadPath = Join-Path $env:TEMP ("leeandnote_telegram_brief_" + $ReportDate + ".png")
Copy-Item -LiteralPath $imagePath -Destination $uploadPath -Force

Add-Type -AssemblyName System.Net.Http
$client = [System.Net.Http.HttpClient]::new()
$content = [System.Net.Http.MultipartFormDataContent]::new()
$fileStream = [System.IO.File]::OpenRead($uploadPath)
try {
  $content.Add([System.Net.Http.StringContent]::new($ChatId), "chat_id")
  $content.Add([System.Net.Http.StringContent]::new($caption), "caption")
  $fileContent = [System.Net.Http.StreamContent]::new($fileStream)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("image/png")
  $content.Add($fileContent, "photo", [System.IO.Path]::GetFileName($uploadPath))
  $httpResponse = $client.PostAsync($sendPhotoUrl, $content).GetAwaiter().GetResult()
  $result = $httpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $response = $result | ConvertFrom-Json
  if (-not $httpResponse.IsSuccessStatusCode -or -not $response.ok) {
    throw "Telegram sendPhoto failed: $($response.description)"
  }
} finally {
  $fileStream.Dispose()
  $content.Dispose()
  $client.Dispose()
}
Write-Host "Telegram image notification sent for $ReportDate."
