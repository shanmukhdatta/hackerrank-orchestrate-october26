"""Package only code, README and evaluation Markdown into the required code.zip."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parent.parent
target=ROOT/"code.zip"
sources=[ROOT/"README.md"]
sources.extend(
    p for p in (ROOT/"code").rglob("*")
    if p.is_file()
    and p.suffix.lower() in {".py",".js",".md",".txt"}
    and "__pycache__" not in p.parts
    and ".venv" not in p.parts
)
with ZipFile(target,"w",compression=ZIP_DEFLATED,compresslevel=9) as out:
    for source in sorted(sources):
        out.write(source,source.relative_to(ROOT).as_posix())
with ZipFile(target) as arc:
    required={"README.md","code/main.py","code/main.js","code/evaluation/evaluation_report.md","code/evaluation/usage_report.md"}
    assert required <= set(arc.namelist()), "Incomplete submission ZIP"
    assert not any(name.endswith((".zip",".tar",".gz",".7z")) for name in arc.namelist())
    print("Created:",target,"files:",arc.namelist())
