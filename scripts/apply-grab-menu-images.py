"""Copy mapped GRAB Drive photos into food/menu/grab/{menu-id}.ext"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMPORT_DIR = ROOT / "food" / "menu" / "grab-import"
OUT_DIR = ROOT / "food" / "menu" / "grab"
MAP_PATH = ROOT / "scripts" / "grab-menu-image-map.json"


def main() -> None:
    mapping: dict[str, str] = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for menu_id, source_name in mapping.items():
        source = IMPORT_DIR / source_name
        if not source.exists():
            raise FileNotFoundError(f"Missing source for {menu_id}: {source}")
        ext = source.suffix.lower()
        dest = OUT_DIR / f"{menu_id}{ext}"
        shutil.copy2(source, dest)
        print(f"{menu_id} <- {source_name}")

    print(f"Applied {len(mapping)} images to {OUT_DIR}")


if __name__ == "__main__":
    main()
