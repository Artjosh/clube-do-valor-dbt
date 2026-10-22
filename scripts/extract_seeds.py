"""Extract literal CSV arrays without editing, normalizing or deduplicating values."""
import argparse
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser()
parser.add_argument("html", type=Path)
args = parser.parse_args()
html = args.html.read_text(encoding="utf-8")
root = Path(__file__).resolve().parents[1]
for name, count in [("transactions", 100), ("clients", 27)]:
    match = re.search(r"function download" + name.title() + r"\(\)\s*\{\s*var rows = (\[.*?\]);", html, re.S)
    if not match:
        raise ValueError(f"Missing literal array: {name}")
    rows = json.loads(match.group(1))
    assert len(rows) == count + 1, (name, len(rows))
    destination = root / "seeds" / f"{name}.csv"
    destination.write_bytes("\r\n".join(rows).encode("utf-8"))
    print(f"{destination.name}: {count} records, original download bytes preserved")
