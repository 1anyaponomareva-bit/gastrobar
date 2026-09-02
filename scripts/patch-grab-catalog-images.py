"""Patch foodMenuCatalog.ts image paths from grab-menu-image-map.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP_PATH = ROOT / "scripts" / "grab-menu-image-map.json"
CATALOG_PATH = ROOT / "src" / "lib" / "poster" / "foodMenuCatalog.ts"


def main() -> None:
    mapping: dict[str, str] = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    text = CATALOG_PATH.read_text(encoding="utf-8")

    for menu_id, src in mapping.items():
        ext = Path(src).suffix.lower()
        new_path = f"grab/{menu_id}{ext}"
        pattern = (
            rf'(id: "{re.escape(menu_id)}"[\s\S]*?image: foodMenuImage\(")([^"]+)("\),)'
        )
        text, count = re.subn(pattern, rf"\1{new_path}\3", text, count=1)
        if count != 1:
            raise RuntimeError(f"Could not update {menu_id} ({count} matches)")

    CATALOG_PATH.write_text(text, encoding="utf-8")
    print(f"Updated {len(mapping)} catalog images")


if __name__ == "__main__":
    main()
