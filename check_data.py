#!/usr/bin/env python3
"""检查 data/*.json 的语法，出错时给出文件名和行列号。

用法（在网站根目录）：
    python check_data.py
"""

import json
import sys
from pathlib import Path


def main() -> int:
    data_dir = Path(__file__).resolve().parent / "data"
    files = sorted(data_dir.glob("*.json"))

    if not files:
        print("No data/*.json found")
        return 1

    failed = 0
    for path in files:
        try:
            with path.open(encoding="utf-8") as handle:
                json.load(handle)
        except json.JSONDecodeError as error:
            failed += 1
            print(f"[FAIL] {path.name}: line {error.lineno}, column {error.colno} - {error.msg}")
        except OSError as error:
            failed += 1
            print(f"[FAIL] {path.name}: {error}")
        else:
            print(f"[OK]   {path.name}")

    print(f"\n{len(files) - failed}/{len(files)} file(s) passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
