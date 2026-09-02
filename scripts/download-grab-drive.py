"""Download images from a public Google Drive folder listing HTML."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import unquote

import urllib.request

ROOT = Path(__file__).resolve().parent.parent
HTML_PATH = ROOT / "scripts" / "drive-folder.html"
OUT_DIR = ROOT / "food" / "menu" / "grab-import"
MAP_PATH = ROOT / "scripts" / "grab-drive-files.json"


def parse_entries(html: str) -> list[dict[str, str]]:
    pattern = re.compile(
        r'id="entry-([^"]+)"[^>]*>.*?'
        r'href="https://drive\.google\.com/file/d/([^"]+)/view[^"]*"[^>]*>.*?'
        r'<div class="flip-entry-title">([^<]+)</div>',
        re.DOTALL,
    )
    entries: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for file_id, _, title in pattern.findall(html):
        if file_id in seen_ids:
            continue
        seen_ids.add(file_id)
        entries.append({"id": file_id, "title": unquote(title.strip())})
    return entries


def download_file(file_id: str, dest: Path) -> bool:
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        data = response.read()
        if b"<!DOCTYPE html" in data[:200] or b"virus scan warning" in data.lower():
            match = re.search(rb"confirm=([0-9A-Za-z_]+)", data)
            if not match:
                return False
            confirm = match.group(1).decode()
            url2 = f"{url}&confirm={confirm}"
            with urllib.request.urlopen(url2, timeout=120) as response2:
                data = response2.read()
        dest.write_bytes(data)
    return dest.stat().st_size > 1024


def main() -> None:
    html = HTML_PATH.read_text(encoding="utf-8")
    entries = parse_entries(html)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MAP_PATH.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Found {len(entries)} files")

    ok = 0
    for index, entry in enumerate(entries, start=1):
        safe_name = re.sub(r'[<>:"/\\|?*]+', "_", entry["title"])
        dest = OUT_DIR / f"{index:03d}_{safe_name}"
        if dest.exists() and dest.stat().st_size > 1024:
            ok += 1
            continue
        try:
            if download_file(entry["id"], dest):
                ok += 1
                print(f"[{index}/{len(entries)}] {entry['title']}")
            else:
                print(f"FAIL {entry['title']}")
        except Exception as exc:  # noqa: BLE001
            print(f"ERR {entry['title']}: {exc}")
        time.sleep(0.4)

    print(f"Downloaded {ok}/{len(entries)} -> {OUT_DIR}")


if __name__ == "__main__":
    main()
