"""HackerRank Python entrypoint for the evidence-first Node.js audit engine.

When OCR/PDF dependencies are available, automatically prepare the supplied
public evidence. A clean code.zip extraction therefore does not depend on
previously committed/generated text files.
"""
from __future__ import annotations

import csv
import os
import shutil
import subprocess
import sys
from pathlib import Path


def prepare_media(root: Path) -> None:
    if os.getenv("ORCHESTRATE_SKIP_MEDIA") == "1":
        print("Warning: OCR/PDF evidence extraction explicitly disabled.", file=sys.stderr)
        return

    manifest = root / "dataset" / "evidence_files.csv"
    if not manifest.exists():
        raise FileNotFoundError(f"Missing challenge evidence manifest: {manifest}")

    with manifest.open(encoding="utf-8", newline="") as handle:
        media = [record for record in csv.DictReader(handle)
                 if Path(record["file_path"]).suffix.lower() in {".png", ".pdf"}]
    if not media:
        return

    extracted_dir = root / "dataset" / "evidence" / "parsed_media"
    missing = [record for record in media
               if not (extracted_dir / f"{record['file_id']}.txt").exists()]

    if not missing:
        return

    if not shutil.which("tesseract") or not shutil.which("pdftotext"):
        print(
            f"Warning: {len(missing)} evidence extractions are missing. "
            "Install tesseract and poppler-utils to reproduce the "
            "full-evidence predictions.",
            file=sys.stderr,
        )
        return

    print(f"Extracting {len(missing)} missing PDF/image evidence files...", file=sys.stderr)
    subprocess.run(
        [sys.executable, str(root / "code" / "extract_media.py")],
        cwd=root, check=True,
    )


def main() -> int:
    root = Path(__file__).resolve().parent.parent
    prepare_media(root)
    if not shutil.which("node"):
        sys.exit("Node.js 18+ is required. Install Node and rerun python3 code/main.py.")
    return subprocess.call(["node", str(root / "code" / "main.js")], cwd=root)


if __name__ == "__main__":
    raise SystemExit(main())
