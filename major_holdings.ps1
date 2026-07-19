param(
    [Parameter(Position = 0)]
    [string[]]$Query = @(),

    [string]$BgnDe = (Get-Date).AddMonths(-3).ToString('yyyyMMdd'),
    [string]$EndDe = (Get-Date).ToString('yyyyMMdd'),
    [string]$ApiKey = $env:DART_API_KEY,
    [string]$CacheDir = '.cache',
    [string]$Out = '',
    [string]$JsonOut = 'site\data\latest.json',
    [double]$MinCurrent = [double]::NaN,
    [double]$MinDelta = [double]::NaN,
    [switch]$OnlyCross5,
    [switch]$IncludeControl
)

$ErrorActionPreference = 'Stop'
$BaseUrl = 'https://opendart.fss.or.kr/api'

function Normalize-Date([string]$Value) {
    return ($Value -replace '-', '').Trim()
}

function Convert-ToNumber($Value) {
    if ($null -eq $Value) { return $null }
    $text = ([string]$Value).Replace(',', '').Replace('%', '').Trim()
    if ($text -eq '' -or $text -eq '-') { return $null }
    $parsed = 0.0
    if ([double]::TryParse($text, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) {
        return $parsed
    }
    return $null
}

function Invoke-DartJson([string]$Path, [hashtable]$Params) {
    $queryString = ($Params.GetEnumerator() | ForEach-Object {
        '{0}={1}' -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value)
    }) -join '&'
    $uri = "$BaseUrl/$Path`?$queryString"
    $response = Invoke-RestMethod -Uri $uri -Headers @{ 'User-Agent' = 'major-holdings-monitor/1.0' } -TimeoutSec 60
    if ($response.status -ne '000' -and $response.status -ne '013') {
        throw "DART API 오류 $($response.status): $($response.message)"
    }
    return $response
}

function Get-CorpCodeXml([string]$Key, [string]$Dir) {
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    $xmlPath = Join-Path $Dir 'CORPCODE.xml'
    if (Test-Path -LiteralPath $xmlPath) { return $xmlPath }

    $zipPath = Join-Path $Dir 'corpCode.zip'
    $uri = "$BaseUrl/corpCode.xml?crtfc_key=$([uri]::EscapeDataString($Key))"
    Invoke-WebRequest -Uri $uri -OutFile $zipPath -Headers @{ 'User-Agent' = 'major-holdings-monitor/1.0' } -TimeoutSec 90
    Expand-Archive -LiteralPath $zipPath -DestinationPath $Dir -Force
    return $xmlPath
}

function Resolve-Queries([string[]]$Values) {
    $resolved = @()
    foreach ($value in $Values) {
        foreach ($part in ([string]$value -split ',')) {
            $trimmed = $part.Trim()
            if ($trimmed) { $resolved += $trimmed }
        }
    }
    return @($resolved | Select-Object -Unique)
}

function Find-Corp([xml]$CorpXml, [string]$Search) {
    $items = @($CorpXml.result.list | Where-Object { $_.stock_code -and $_.stock_code.Trim() -ne '' })
    $normalized = $Search.Trim()
    if ($normalized -match '^\d+$') {
        $code = $normalized.PadLeft(6, '0')
        $matches = @($items | Where-Object { $_.stock_code.Trim() -eq $code })
    }
    else {
        $matches = @($items | Where-Object { $_.corp_name.Trim() -eq $normalized })
        if ($matches.Count -eq 0) {
            $matches = @($items | Where-Object { $_.corp_name.Trim().Contains($normalized) })
        }
    }

    if ($matches.Count -eq 0) {
        throw "회사코드를 찾지 못했습니다: $Search"
    }
    if ($matches.Count -gt 1) {
        $sample = ($matches | Select-Object -First 10 | ForEach-Object { "$($_.corp_name)($($_.stock_code))" }) -join ', '
        throw "검색 결과가 여러 개입니다. 종목코드로 다시 입력하세요: $sample"
    }
    return [pscustomobject]@{
        corp_code = [string]$matches[0].corp_code
        corp_name = [string]$matches[0].corp_name
        stock_code = [string]$matches[0].stock_code
        corp_cls = ''
    }
}

function Get-RecentMajorReports([string]$Key, [string]$Bgn, [string]$End) {
    $page = 1
    $all = @()
    while ($true) {
        Write-Host "최근 공시목록 조회: $page 페이지"
        $data = Invoke-DartJson -Path 'list.json' -Params @{
            crtfc_key = $Key
            bgn_de = $Bgn
            end_de = $End
            pblntf_ty = 'D'
            page_no = $page
            page_count = 100
        }
        if ($data.status -eq '013') { break }
        $items = @($data.list | Where-Object {
            ($_.corp_cls -eq 'Y' -or $_.corp_cls -eq 'K') -and
            ([string]$_.report_nm -like '*주식등의대량보유상황보고서(일반)*' -or [string]$_.report_nm -like '*주식등의대량보유상황보고서(약식)*')
        })
        $all += $items
        if ($page -ge [int]$data.total_page) { break }
        $page += 1
    }
    return @($all)
}

function New-Row($Item, $Corp, [hashtable]$WantedMap, [string]$Bgn, [string]$End) {
    $rceptNo = [string]$Item.rcept_no
    $rceptDe = Normalize-Date ([string]$Item.rcept_dt)
    $obligationDe = Normalize-Date ([string]$(if ($Item.report_ostn) { $Item.report_ostn } elseif ($Item.report_de) { $Item.report_de } elseif ($Item.report_dt) { $Item.report_dt } else { $Item.rcept_dt }))
    $reportType = ([string]$Item.report_tp).Trim()
    if ($WantedMap.Count -gt 0 -and -not $WantedMap.ContainsKey($rceptNo)) { return $null }
    if (($reportType -ne '일반' -and $reportType -ne '약식') -or $rceptDe -lt $Bgn -or $rceptDe -gt $End) { return $null }

    $current = Convert-ToNumber $Item.stkrt
    $delta = Convert-ToNumber $Item.stkrt_irds
    $previous = $null
    if ($null -ne $current -and $null -ne $delta) {
        $previous = [math]::Round($current - $delta, 4)
    }
    $crossed5 = ($null -ne $previous -and $null -ne $current -and $previous -lt 5 -and $current -ge 5)

    return [pscustomobject]@{
        보고의무발생일 = $obligationDe
        접수일 = $rceptDe
        시장 = $(if ($Corp.corp_cls -eq 'Y') { 'KOSPI' } elseif ($Corp.corp_cls -eq 'K') { 'KOSDAQ' } else { '' })
        보고구분 = $reportType
        종목명 = [string]$Item.corp_name
        종목코드 = [string]$Corp.stock_code
        보고자 = [string]$Item.repror
        직전지분율 = $previous
        이번지분율 = $current
        증감률 = $delta
        '5퍼센트상향돌파' = $(if ($crossed5) { 'Y' } else { '' })
        보유주식수 = [string]$Item.stkqy
        증감주식수 = [string]$Item.stkqy_irds
        보고사유 = [string]$Item.report_resn
        접수번호 = $rceptNo
        DART_URL = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=$rceptNo"
        주요계약주식수 = [string]$Item.ctr_stkqy
        주요계약지분율 = [string]$Item.ctr_stkrt
    }
}

function Format-Pct($Value) {
    if ($null -eq $Value) { return '-' }
    return ('{0:N2}' -f [double]$Value)
}

if (-not $ApiKey) {
    throw 'DART API 키가 없습니다. $env:DART_API_KEY 환경변수를 설정하거나 -ApiKey를 넣어주세요.'
}

$bgn = Normalize-Date $BgnDe
$end = Normalize-Date $EndDe
if ($bgn.Length -ne 8 -or $end.Length -ne 8) {
    throw '날짜는 YYYYMMDD 형식이어야 합니다.'
}

$queries = Resolve-Queries $Query
$corpXmlPath = Get-CorpCodeXml -Key $ApiKey -Dir $CacheDir
[xml]$corpXml = Get-Content -LiteralPath $corpXmlPath -Encoding UTF8

$wantedByCorp = @{}
$corps = @()
if ($queries.Count -eq 0) {
    $reports = Get-RecentMajorReports -Key $ApiKey -Bgn $bgn -End $end
    foreach ($report in $reports) {
        $code = [string]$report.corp_code
        if (-not $wantedByCorp.ContainsKey($code)) {
            $wantedByCorp[$code] = @{
                corp = [pscustomobject]@{
                    corp_code = [string]$report.corp_code
                    corp_name = [string]$report.corp_name
                    stock_code = [string]$report.stock_code
                    corp_cls = [string]$report.corp_cls
                }
                rcepts = @{}
            }
        }
        $wantedByCorp[$code].rcepts[[string]$report.rcept_no] = $true
    }
    $corps = @($wantedByCorp.Keys | ForEach-Object { $wantedByCorp[$_].corp } | Sort-Object corp_name)
}
else {
    $corps = @($queries | ForEach-Object { Find-Corp -CorpXml $corpXml -Search $_ })
    foreach ($corp in $corps) {
        $wantedByCorp[$corp.corp_code] = @{ corp = $corp; rcepts = @{} }
    }
}

$rows = @()
$index = 0
foreach ($corp in $corps) {
    $index += 1
    Write-Host "상세 조회: $index/$($corps.Count) $($corp.corp_name)($($corp.stock_code))"
    $major = Invoke-DartJson -Path 'majorstock.json' -Params @{
        crtfc_key = $ApiKey
        corp_code = $corp.corp_code
        bsns_year = (Get-Date).Year
        reprt_code = '11011'
    }
    $wanted = $wantedByCorp[$corp.corp_code].rcepts
    foreach ($item in @($major.list)) {
        $row = New-Row -Item $item -Corp $corp -WantedMap $wanted -Bgn $bgn -End $end
        if ($null -ne $row) { $rows += $row }
    }
}

$rows = @($rows | Sort-Object 접수일, 종목명, 접수번호 -Descending)
if (-not [double]::IsNaN($MinCurrent)) {
    $rows = @($rows | Where-Object { $null -ne $_.이번지분율 -and $_.이번지분율 -ge $MinCurrent })
}
if (-not [double]::IsNaN($MinDelta)) {
    $rows = @($rows | Where-Object { $null -ne $_.증감률 -and $_.증감률 -ge $MinDelta })
}
if ($OnlyCross5) {
    $rows = @($rows | Where-Object { $_.'5퍼센트상향돌파' -eq 'Y' })
}

if (-not $Out) {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $safeName = if ($queries.Count -eq 0) { 'kospi_kosdaq_recent3m' } elseif ($corps.Count -eq 1) { ([string]$corps[0].corp_name) -replace '[\\/:*?"<>| ]', '_' } else { "multi_$($corps.Count)stocks" }
    $Out = Join-Path 'results' "major_holdings_${safeName}_$stamp.csv"
}

$fields = @('접수일', '시장', '보고구분', '종목명', '종목코드', '보고자', '직전지분율', '이번지분율', '증감률', '5퍼센트상향돌파', '보유주식수', '증감주식수', '보고사유', '접수번호', 'DART_URL')
if ($IncludeControl) {
    $fields += @('주요계약주식수', '주요계약지분율')
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
$rows | Select-Object $fields | Export-Csv -LiteralPath $Out -NoTypeInformation -Encoding UTF8

if ($JsonOut) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $JsonOut) | Out-Null
    $payload = [pscustomobject]@{
        generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        scope = $(if ($queries.Count -eq 0) { 'KOSPI/KOSDAQ 최근 3개월 전체' } else { '선택 종목' })
        query = $queries
        bgnDe = $bgn
        endDe = $end
        corps = @($corps | ForEach-Object {
            [pscustomobject]@{
                name = [string]$_.corp_name
                stockCode = [string]$_.stock_code
                corpCode = [string]$_.corp_code
                market = $(if ($_.corp_cls -eq 'Y') { 'KOSPI' } elseif ($_.corp_cls -eq 'K') { 'KOSDAQ' } else { '' })
            }
        })
        rows = @($rows)
    }
    $json = $payload | ConvertTo-Json -Depth 6
    $json | Set-Content -LiteralPath $JsonOut -Encoding UTF8
    $latestJs = Join-Path (Split-Path -Parent $JsonOut) 'latest.js'
    "window.__DART_DATA__ = $json;" | Set-Content -LiteralPath $latestJs -Encoding UTF8
}

$corpTitle = if ($queries.Count -eq 0) { 'KOSPI/KOSDAQ 최근 3개월 전체' } elseif ($corps.Count -eq 1) { "$($corps[0].corp_name)($($corps[0].stock_code))" } else { "$($corps.Count)개 선택 종목" }
Write-Host "$corpTitle / $bgn~$end / $($rows.Count)건"
Write-Host '접수일 | 시장 | 종목 | 보고구분 | 보고자 | 직전% | 이번% | 증감%'
Write-Host ('-' * 110)
foreach ($row in @($rows | Select-Object -First 30)) {
    $flag = if ($row.'5퍼센트상향돌파' -eq 'Y') { '  *5% 상향돌파' } else { '' }
    Write-Host ("{0} | {1} | {2} | {3} | {4} | {5} | {6} | {7}{8}" -f $row.접수일, $row.시장, $row.종목명, $row.보고구분, $row.보고자, (Format-Pct $row.직전지분율), (Format-Pct $row.이번지분율), (Format-Pct $row.증감률), $flag)
}
if ($rows.Count -gt 30) {
    Write-Host "... $($rows.Count - 30)건 더 있음"
}
Write-Host "CSV 저장: $((Resolve-Path -LiteralPath $Out).Path)"
if ($JsonOut) {
    Write-Host "모바일 대시보드 데이터: $((Resolve-Path -LiteralPath $JsonOut).Path)"
}
