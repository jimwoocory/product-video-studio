from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import browser_cookie3


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile-dir", required=True)
    parser.add_argument("--cookie-file", required=True)
    args = parser.parse_args()

    profile_dir = Path(args.profile_dir).expanduser().resolve()
    cookie_db = profile_dir / "Default" / "Network" / "Cookies"
    local_state = profile_dir / "Local State"
    target = Path(args.cookie_file).expanduser().resolve()

    if not cookie_db.exists() or not local_state.exists():
        raise SystemExit(2)

    jar = browser_cookie3.chrome(
        cookie_file=str(cookie_db),
        key_file=str(local_state),
        domain_name=".douyin.com",
    )
    cookies = []
    key_names = {"sessionid", "passport_csrf_token", "odin_tt", "sid_guard"}
    present = set()

    for item in jar:
        domain = item.domain or ""
        if "douyin" not in domain:
            continue
        present.add(item.name)
        cookie = {
            "name": item.name,
            "value": item.value,
            "domain": domain,
            "path": item.path or "/",
        }
        if item.expires:
            cookie["expires"] = float(item.expires)
        if item.secure:
            cookie["secure"] = True
        rest = getattr(item, "_rest", {}) or {}
        if "HttpOnly" in rest:
            cookie["httpOnly"] = True
        same_site = rest.get("SameSite") or rest.get("sameSite")
        if same_site in {"Strict", "Lax", "None"}:
            cookie["sameSite"] = same_site
        cookies.append(cookie)

    has_session = bool(key_names & present)
    if not has_session:
        print(
            f"COOKIE_COUNT={len(cookies)} HAS_SESSION=false",
            flush=True,
        )
        return 3

    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(target.suffix + ".tmp")
    temp.write_text(
        json.dumps({"cookies": cookies, "origins": []}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp, target)

    print(
        f"COOKIE_COUNT={len(cookies)} HAS_SESSION=true",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
