"""Extract text from supplied PDF and PNG evidence for indexed analysis.

Uses system-provided open-source poppler and Tesseract executables.
No external APIs, uploads, tokens or sensitive prompts are involved.
The source evidence is not altered.
"""
import csv
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "dataset" / "evidence_files.csv"
OUTPUT = ROOT / "dataset" / "evidence" / "parsed_media"

def redact(s: str) -> str:
    return re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[email]", s)

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    records = []
    with MANIFEST.open(encoding="utf-8", newline="") as handle:
        manifest = list(csv.DictReader(handle))
    for record in manifest:
        rel = Path(record["file_path"])
        suffix = rel.suffix.lower()
        if suffix not in {".pdf", ".png"}:
            continue
        filename = ROOT / "dataset" / rel
        if suffix == ".pdf":
            args = ["pdftotext", "-layout", str(filename), "-"]
        else:
            args = ["tesseract", str(filename), "stdout", "--psm", "6"]
        try:
            proc = subprocess.run(args, capture_output=True, text=True, timeout=45, check=True)
            text = proc.stdout
            status = "ok" if text.strip() else "empty"
        except (FileNotFoundError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
            text = ""
            status = type(exc).__name__
        (OUTPUT / f"{record['file_id']}.txt").write_text(text, encoding="utf-8")
        preview=redact(text[:550]).replace("\n", " / ")
        records.append({"file_id":record["file_id"],"type":suffix,"chars":len(text),"status":status,"preview":preview})
    report = "# OCR and PDF text extraction audit\n\nAll source files are part of the public challenge dataset. This report is diagnostic; machine-readable evidence remains primary.\n\n"
    for rec in records:
        report += f"## {rec['file_id']} ({rec['type']}, {rec['status']}, {rec['chars']} characters)\n\n`{rec['preview']}`\n\n"
    (ROOT/"code"/"evaluation"/"media_audit.md").write_text(report,encoding="utf-8")
    print(json.dumps([{k:v for k,v in rec.items() if k!="preview"} for rec in records],indent=2))

if __name__ == "__main__":
    main()
