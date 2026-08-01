# DART 대량보유 지분변동 수집기

`주식등의대량보유상황보고서(일반)`과 `주식등의대량보유상황보고서(약식)`의 지분율 변화를 CSV로 저장합니다.

## 준비

PowerShell에서 API 키를 환경변수로 설정합니다.

```powershell
$env:DART_API_KEY="여기에_DART_API_KEY"
```

## 실행 예시

```powershell
.\major_holdings.ps1
```

아무 종목도 넣지 않으면 최근 3개월 코스피/코스닥 전체에서 `주식등의대량보유상황보고서(일반/약식)`이 나온 종목만 자동으로 추립니다.

특정 종목만 보려면:

```powershell
.\major_holdings.ps1 주성엔지니어링 -BgnDe 20240101 -EndDe 20260710
```

종목코드로도 실행할 수 있습니다.

```powershell
.\major_holdings.ps1 036930 -BgnDe 20240101 -EndDe 20260710
```

5% 미만에서 5% 이상으로 올라온 건만 보려면:

```powershell
.\major_holdings.ps1 주성엔지니어링 -BgnDe 20240101 -OnlyCross5
```

지분율이 1%p 이상 증가한 건만 보려면:

```powershell
.\major_holdings.ps1 주성엔지니어링 -BgnDe 20240101 -MinDelta 1
```

Python이 설치되어 있으면 `major_holdings.py`도 같은 용도로 사용할 수 있습니다.

## 결과 컬럼

- `직전지분율`: OpenDART의 이번 지분율에서 증감률을 뺀 값입니다.
- `이번지분율`: OpenDART `stkrt`
- `증감률`: OpenDART `stkrt_irds`
- `5퍼센트상향돌파`: 직전 지분율이 5% 미만이고 이번 지분율이 5% 이상이면 `Y`
- `DART_URL`: 해당 접수번호의 DART 원문 링크

CSV는 기본적으로 `results` 폴더에 저장됩니다.

## 모바일로 보기

데이터를 갱신한 뒤 아래 파일을 클릭해서 엽니다.

```text
site\index.html
```

화면 안에서 `일별`, `주별`, `월별`을 전환할 수 있고, `PDF` 버튼을 누르면 브라우저 인쇄 화면에서 `PDF로 저장`을 선택할 수 있습니다.

```powershell
.\major_holdings.ps1 주성엔지니어링 -BgnDe 20240101 -EndDe 20260710
```

이 명령을 실행하면 CSV와 함께 `site\data\latest.json`이 갱신됩니다. 모바일에서 보려면 나중에 이 `site` 폴더를 도메인에 올리면 됩니다.
더블클릭으로 열 때도 데이터가 보이도록 `site\data\latest.js`도 같이 생성됩니다.

대시보드는 전체 종목 랭킹을 먼저 보여주고, 종목을 선택하면 최근 일봉 차트 위에 공시 이벤트 마커를 표시합니다.

## 운영/수익화 설계

- 서버 DB 구조: `ARCHITECTURE.md`, `server/schema.sql`
- AdSense 배치 전략: `ADSENSE_STRATEGY.md`

공개 사이트에서는 사용자 접속 때 DART API를 직접 호출하지 말고, 서버 스케줄러가 하루 1~2회 DB에 캐싱한 데이터를 읽도록 설계합니다.

## 일일 갱신

전체 갱신은 아래 한 번으로 실행합니다.

```powershell
.\daily_update.ps1 -ApiKey "DART_API_KEY"
```

이 스크립트는 DART 공시 수집 종료일을 실행 당일로 잡고, 가격 캐시는 별도로 최신 일봉까지 다시 받습니다. 따라서 화면에서 `2026-07-04 ~ 2026-07-14`처럼 기간을 잡았는데 `2026-07-14` 접수 공시가 없어도, `현재 종가`는 공시 접수일이 아니라 가격 캐시의 최신 거래일 기준으로 표시됩니다.

운영 시에는 장 마감 후 1회, 새벽 재검증 1회 정도가 적당합니다. 사용자가 접속할 때마다 DART나 가격 API를 호출하지 않고 이미 만들어진 캐시 파일만 읽기 때문에 트래픽 부담은 작습니다.

## 텔레그램 일일 알림

`daily_update.ps1` 실행이 끝나면 `telegram_notify.ps1`이 최신 접수일 기준 대량보유 공시 요약을 텔레그램으로 보냅니다.

로컬에서는 `telegram_config.local.ps1`에 아래 값을 저장합니다. 이 파일은 `.gitignore`에 포함되어 GitHub에 올리지 않습니다.

```powershell
$env:TELEGRAM_CHAT_ID = "텔레그램_CHAT_ID"
$env:TELEGRAM_BOT_TOKEN = "텔레그램_BOT_TOKEN"
$env:SITE_URL = "https://내사이트주소"
```

테스트만 하려면 `텔레그램테스트_클릭.bat`을 더블클릭합니다.

GitHub Actions 자동 갱신에서도 알림을 보내려면 저장소 `Settings > Secrets and variables > Actions`에 아래 Secret을 추가합니다.

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

사이트 링크를 메시지에 넣으려면 Variables에 `SITE_URL`도 추가합니다.
