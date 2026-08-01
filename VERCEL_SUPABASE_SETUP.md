# Vercel + Supabase 전환 가이드

이 구조는 사용자가 접속할 때 DART/Yahoo를 직접 호출하지 않고, Supabase에 캐싱된 데이터를 Vercel 사이트가 읽는 방식입니다.

## 1. Supabase 프로젝트 만들기

1. Supabase에서 새 프로젝트를 만듭니다.
2. `SQL Editor`를 엽니다.
3. `supabase/schema.sql` 내용을 붙여넣고 실행합니다.

생성되는 핵심 테이블:

- `site_cache`: 대량보유 데이터, 로고, 현재가, 이벤트 가격 등 작은 캐시
- `price_candles`: 종목별 1년 일봉 가격 캐시

## 2. 로컬 캐시를 Supabase에 업로드

PowerShell에서 프로젝트 폴더로 이동합니다.

```powershell
cd "C:\Users\user\Documents\구글애드센스\dart_major_holdings"
$env:SUPABASE_URL="https://프로젝트ID.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="Supabase service_role key"
npm run sync:supabase
npm run verify:supabase
```

`service_role key`는 절대 브라우저 코드에 넣으면 안 됩니다. Vercel 환경변수나 로컬 터미널 환경변수로만 사용합니다.

## 3. Vercel 환경변수

Vercel 프로젝트 `Settings > Environment Variables`에 아래 값을 추가합니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DART_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SITE_URL`
- `CRON_SECRET`

## 4. Vercel 배포

Vercel에서 이 폴더를 프로젝트로 연결하면 `vercel.json` 기준으로 `site` 폴더가 배포됩니다.

API:

- `/api/bootstrap`: Supabase에서 대시보드 기본 데이터 조회
- `/api/prices?stockCode=005930`: 종목별 가격 캐시 조회
- `/api/cron/daily-update`: 자동 갱신용 엔드포인트

## 5. 현재 자동 갱신 상태

현재는 DB/API 구조를 먼저 붙인 상태입니다.

다음 작업에서 기존 PowerShell 수집기를 Vercel에서 실행 가능한 Node/Python 서버리스 수집기로 이식해야 완전 자동화됩니다. 그 전까지는:

1. 로컬에서 `데이터갱신_클릭.bat` 실행
2. `npm run sync:supabase` 실행
3. Vercel 사이트는 Supabase의 최신 캐시를 읽음

이 중 1~2번을 다음 단계에서 Vercel Cron 한 번으로 합치면 됩니다.
