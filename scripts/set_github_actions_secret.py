#!/usr/bin/env python3
"""Encrypt and set one GitHub Actions repository secret from environment variables."""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.request

from nacl import encoding, public


def github_request(url: str, token: str, method: str = "GET", data: dict | None = None) -> dict:
    payload = None if data is None else json.dumps(data).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "leeandnote-secret-setup",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read()
        return json.loads(body) if body else {}


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: set_github_actions_secret.py OWNER REPO SECRET_NAME", file=sys.stderr)
        return 2
    owner, repo, secret_name = sys.argv[1:]
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    value = os.environ.get("SECRET_VALUE", "")
    if not token or not value:
        print("GITHUB_TOKEN and SECRET_VALUE are required.", file=sys.stderr)
        return 2

    base_url = f"https://api.github.com/repos/{owner}/{repo}/actions/secrets"
    key = github_request(f"{base_url}/public-key", token)
    public_key = public.PublicKey(key["key"].encode("utf-8"), encoding.Base64Encoder())
    encrypted = public.SealedBox(public_key).encrypt(value.encode("utf-8"))
    github_request(
        f"{base_url}/{secret_name}",
        token,
        method="PUT",
        data={
            "encrypted_value": base64.b64encode(encrypted).decode("ascii"),
            "key_id": key["key_id"],
        },
    )
    print(f"SET_SECRET={secret_name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
