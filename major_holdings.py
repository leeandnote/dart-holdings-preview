import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


BASE_URL = "https://opendart.fss.or.kr/api"
REPORT_TYPES = {"일반", "약식"}


@dataclass(frozen=True)
class Corp:
    corp_code: str
    corp_name: str
    stock_code: str
    modify_date: str


def parse_args() -> argparse.Namespace:
    today = date.today()
    default_bgn = today.replace(year=today.year - 2).strftime("%Y%m%d")
    parser = argparse.ArgumentParser(
        description="OpenDART 주식등의대량보유상황보고서 지분율 변화 수집기"
    )
    parser.add_argument("query", help="종목명 또는 6자리 종목코드. 예: 주성엔지니어링 또는 036930")
    parser.add_argument("--bgn-de", default=default_bgn, help="조회 시작일 YYYYMMDD")
    parser.add_argument("--end-de", default=today.strftime("%Y%m%d"), help="조회 종료일 YYYYMMDD")
    parser.add_argument("--api-key", default=os.getenv("DART_API_KEY"), help="DART API key. 미지정 시 DART_API_KEY 환경변수 사용")
    parser.add_argument("--cache-dir", default=".cache", help="corpCode.xml 캐시 폴더")
    parser.add_argument("--out", default="", help="CSV 저장 경로. 미지정 시 results/major_holdings_종목_일시.csv")
    parser.add_argument("--min-current", type=float, default=None, help="이번 지분율 하한 필터")
    parser.add_argument("--min-delta", type=float, default=None, help="지분율 증감 하한 필터. 예: 1.0")
    parser.add_argument("--only-cross-5", action="store_true", help="직전 5%% 미만에서 이번 5%% 이상으로 올라온 건만 출력")
    parser.add_argument("--include-control", action="store_true", help="보유목적상 주요계약/의결권 관련 지분 필드도 CSV에 포함")
    return parser.parse_args()


def request_json(path: str, params: dict[str, str]) -> dict[str, Any]:
    url = f"{BASE_URL}/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "major-holdings-monitor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            body = response.read().decode("utf-8")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"DART API 연결 실패: {exc}") from exc

    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"DART API JSON 파싱 실패: {body[:200]}") from exc

    status = data.get("status")
    if status not in ("000", "013"):
        raise RuntimeError(f"DART API 오류 {status}: {data.get('message')}")
    return data


def download_corp_code(api_key: str, cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    zip_path = cache_dir / "corpCode.zip"
    xml_path = cache_dir / "CORPCODE.xml"
    if xml_path.exists():
        return xml_path

    url = f"{BASE_URL}/corpCode.xml?" + urllib.parse.urlencode({"crtfc_key": api_key})
    req = urllib.request.Request(url, headers={"User-Agent": "major-holdings-monitor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            zip_path.write_bytes(response.read())
    except urllib.error.URLError as exc:
        raise RuntimeError(f"회사코드 다운로드 실패: {exc}") from exc

    with zipfile.ZipFile(zip_path) as archive:
        archive.extract("CORPCODE.xml", cache_dir)
    return xml_path


def load_corps(api_key: str, cache_dir: Path) -> list[Corp]:
    xml_path = download_corp_code(api_key, cache_dir)
    root = ElementTree.parse(xml_path).getroot()
    corps: list[Corp] = []
    for item in root.findall("list"):
        stock_code = text_of(item, "stock_code")
        if not stock_code:
            continue
        corps.append(
            Corp(
                corp_code=text_of(item, "corp_code"),
                corp_name=text_of(item, "corp_name"),
                stock_code=stock_code,
                modify_date=text_of(item, "modify_date"),
            )
        )
    return corps


def text_of(item: ElementTree.Element, name: str) -> str:
    value = item.findtext(name)
    return value.strip() if value else ""


def find_corp(corps: list[Corp], query: str) -> Corp:
    normalized = query.strip()
    if normalized.isdigit():
        normalized = normalized.zfill(6)
        matches = [corp for corp in corps if corp.stock_code == normalized]
    else:
        matches = [corp for corp in corps if corp.corp_name == normalized]
        if not matches:
            matches = [corp for corp in corps if normalized in corp.corp_name]

    if not matches:
        raise RuntimeError(f"회사코드를 찾지 못했습니다: {query}")
    if len(matches) > 1:
        joined = ", ".join(f"{corp.corp_name}({corp.stock_code})" for corp in matches[:10])
        raise RuntimeError(f"검색 결과가 여러 개입니다. 종목코드로 다시 입력하세요: {joined}")
    return matches[0]


def normalize_date(value: str) -> str:
    return value.replace("-", "").strip()


def parse_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).replace(",", "").replace("%", "").strip()
    if text in ("", "-"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def fetch_major_holdings(api_key: str, corp: Corp) -> list[dict[str, Any]]:
    data = request_json(
        "majorstock.json",
        {
            "crtfc_key": api_key,
            "corp_code": corp.corp_code,
            "bsns_year": str(date.today().year),
            "reprt_code": "11011",
        },
    )
    return data.get("list") or []


def enrich_rows(raw_rows: list[dict[str, Any]], bgn_de: str, end_de: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in raw_rows:
        rcept_no = str(row.get("rcept_no", ""))
        if rcept_no in seen:
            continue
        seen.add(rcept_no)

        report_tp = str(row.get("report_tp", "")).strip()
        rcept_de = normalize_date(str(row.get("rcept_dt", "")))
        if report_tp not in REPORT_TYPES or not (bgn_de <= rcept_de <= end_de):
            continue

        current = parse_float(row.get("stkrt"))
        delta = parse_float(row.get("stkrt_irds"))
        previous = round(current - delta, 4) if current is not None and delta is not None else None
        crossed_5 = previous is not None and current is not None and previous < 5 <= current

        rows.append(
            {
                "접수일": rcept_de,
                "보고구분": report_tp,
                "종목명": row.get("corp_name", ""),
                "종목코드": "",
                "보고자": row.get("repror", ""),
                "직전지분율": previous,
                "이번지분율": current,
                "증감률": delta,
                "보유주식수": row.get("stkqy", ""),
                "증감주식수": row.get("stkqy_irds", ""),
                "보고사유": row.get("report_resn", ""),
                "접수번호": rcept_no,
                "DART_URL": f"https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}",
                "5퍼센트상향돌파": "Y" if crossed_5 else "",
                "주요계약주식수": row.get("ctr_stkqy", ""),
                "주요계약지분율": row.get("ctr_stkrt", ""),
            }
        )
    return sorted(rows, key=lambda item: (item["접수일"], item["접수번호"]), reverse=True)


def apply_filters(rows: list[dict[str, Any]], args: argparse.Namespace) -> list[dict[str, Any]]:
    filtered = rows
    if args.min_current is not None:
        filtered = [row for row in filtered if row["이번지분율"] is not None and row["이번지분율"] >= args.min_current]
    if args.min_delta is not None:
        filtered = [row for row in filtered if row["증감률"] is not None and row["증감률"] >= args.min_delta]
    if args.only_cross_5:
        filtered = [row for row in filtered if row["5퍼센트상향돌파"] == "Y"]
    return filtered


def default_output_path(corp: Corp) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(ch if ch.isalnum() else "_" for ch in corp.corp_name)
    return Path("results") / f"major_holdings_{safe_name}_{corp.stock_code}_{stamp}.csv"


def write_csv(rows: list[dict[str, Any]], path: Path, include_control: bool) -> None:
    fields = [
        "접수일",
        "보고구분",
        "종목명",
        "종목코드",
        "보고자",
        "직전지분율",
        "이번지분율",
        "증감률",
        "5퍼센트상향돌파",
        "보유주식수",
        "증감주식수",
        "보고사유",
        "접수번호",
        "DART_URL",
    ]
    if include_control:
        fields.extend(["주요계약주식수", "주요계약지분율"])
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def print_table(rows: list[dict[str, Any]], limit: int = 20) -> None:
    if not rows:
        print("조회 결과가 없습니다.")
        return
    headers = ["접수일", "보고구분", "보고자", "직전%", "이번%", "증감%"]
    print(" | ".join(headers))
    print("-" * 78)
    for row in rows[:limit]:
        values = [
            row["접수일"],
            row["보고구분"],
            str(row["보고자"]),
            format_pct(row["직전지분율"]),
            format_pct(row["이번지분율"]),
            format_pct(row["증감률"]),
        ]
        flag = "  *5% 상향돌파" if row["5퍼센트상향돌파"] == "Y" else ""
        print(" | ".join(values) + flag)
    if len(rows) > limit:
        print(f"... {len(rows) - limit}건 더 있음")


def format_pct(value: Any) -> str:
    if value is None:
        return "-"
    return f"{float(value):.2f}"


def main() -> int:
    args = parse_args()
    if not args.api_key:
        print("DART API 키가 없습니다. DART_API_KEY 환경변수를 설정하거나 --api-key를 넣어주세요.", file=sys.stderr)
        return 2

    bgn_de = normalize_date(args.bgn_de)
    end_de = normalize_date(args.end_de)
    if len(bgn_de) != 8 or len(end_de) != 8:
        print("날짜는 YYYYMMDD 형식이어야 합니다.", file=sys.stderr)
        return 2

    corps = load_corps(args.api_key, Path(args.cache_dir))
    corp = find_corp(corps, args.query)
    raw_rows = fetch_major_holdings(args.api_key, corp)
    rows = enrich_rows(raw_rows, bgn_de, end_de)
    for row in rows:
        row["종목코드"] = corp.stock_code
    rows = apply_filters(rows, args)

    output_path = Path(args.out) if args.out else default_output_path(corp)
    write_csv(rows, output_path, args.include_control)

    print(f"{corp.corp_name}({corp.stock_code}) / {bgn_de}~{end_de} / {len(rows)}건")
    print_table(rows)
    print(f"CSV 저장: {output_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
