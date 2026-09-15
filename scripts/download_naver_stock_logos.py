#!/usr/bin/env python3
"""Download Korean stock logo SVGs from Naver Finance."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path


LOGO_URL = "https://ssl.pstatic.net/imgstock/fn/real/logo/stock/Stock{code}.svg"
CODE_KEYS = {"종목코드", "stockCode", "stock_code", "code"}
CODE_PATTERN = re.compile(r"^\d{6}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download Naver Finance stock logo SVGs.")
    parser.add_argument("--codes-file", type=Path, help="Text/CSV/JSON file containing stock codes")
    parser.add_argument("--output-dir", type=Path, default=Path("public/logos"))
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--force", action="store_true", help="Replace existing valid SVG files")
    return parser.parse_args()


def normalize_code(value: object) -> str | None:
    text = re.sub(r"\D", "", str(value or ""))
    return text if CODE_PATTERN.fullmatch(text) else None


def codes_from_json(value: object) -> set[str]:
    codes: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key in CODE_KEYS:
                code = normalize_code(item)
                if code:
                    codes.add(code)
            codes.update(codes_from_json(item))
    elif isinstance(value, list):
        for item in value:
            codes.update(codes_from_json(item))
    return codes


def read_codes(path: Path) -> set[str]:
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".json":
        return codes_from_json(json.loads(text))
    return {code for token in re.split(r"[^0-9]+", text) if (code := normalize_code(token))}


def discover_codes() -> set[str]:
    candidates = [
        Path("site/data/latest.json"),
        Path("site/data/disclosure_signals.json"),
    ]
    codes: set[str] = set()
    for path in candidates:
        if path.exists():
            codes.update(read_codes(path))
    return codes


def is_svg(data: bytes) -> bool:
    sample = data[:4096].lstrip().lower()
    return b"<svg" in sample and b"<html" not in sample


def download_logo(code: str, output_dir: Path, timeout: float, retries: int, force: bool) -> tuple[str, str]:
    target = output_dir / f"{code}.svg"
    if not force and target.exists() and is_svg(target.read_bytes()):
        return code, "skipped"

    request = urllib.request.Request(
        LOGO_URL.format(code=code),
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; LeeAndNoteLogoFetcher/1.0)",
            "Referer": "https://finance.naver.com/",
            "Accept": "image/svg+xml,image/*;q=0.8,*/*;q=0.5",
        },
    )
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                data = response.read()
            if not is_svg(data):
                return code, "invalid"
            temp = target.with_suffix(f".svg.{os.getpid()}.tmp")
            temp.write_bytes(data)
            temp.replace(target)
            return code, "downloaded"
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return code, "missing"
            if attempt >= retries:
                return code, "failed"
            time.sleep(0.5 * (2**attempt))
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt >= retries:
                return code, "failed"
            time.sleep(0.5 * (2**attempt))
    return code, "failed"


def main() -> int:
    args = parse_args()
    codes = read_codes(args.codes_file) if args.codes_file else discover_codes()
    if not codes:
        raise SystemExit("No six-digit stock codes found. Pass --codes-file or provide site data JSON.")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [
            executor.submit(download_logo, code, args.output_dir, args.timeout, args.retries, args.force)
            for code in sorted(codes)
        ]
        for future in concurrent.futures.as_completed(futures):
            code, status = future.result()
            results[status] = results.get(status, 0) + 1
            if status in {"failed", "invalid", "missing"}:
                print(f"{status.upper():7} {code}")

    summary = " ".join(f"{key}={results[key]}" for key in sorted(results))
    print(f"TOTAL={len(codes)} {summary}")
    return 1 if results.get("failed", 0) or results.get("invalid", 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())
