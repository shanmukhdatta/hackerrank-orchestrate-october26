"""Package only code, README and evaluation Markdown into the required code.zip."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parent.parent
target=ROOT/"code.zip"
sources=[ROOT/"README.md", ROOT/"AGENTS.md"]
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
    required={"README.md","AGENTS.md","code/main.py","code/main.js","code/evaluation/evaluation_report.md","code/evaluation/usage_report.md"}
    assert required <= set(arc.namelist()), "Incomplete submission ZIP"
    assert not any(name.endswith((".zip",".tar",".gz",".7z")) for name in arc.namelist())
    print("Created:",target,"files:",arc.namelist())

# Convenience archive for downloading the separately submitted deliverables.
# This is NOT the code.zip upload: extract it and upload each required file
# in its own HackerRank submission field.
bundle = ROOT / "submission_bundle.zip"
bundle_files = ["code.zip", "output.csv", "log.txt", "agent_trace_instructions.md"]
with ZipFile(bundle, "w", compression=ZIP_DEFLATED, compresslevel=9) as out:
    for name in bundle_files:
        source = ROOT / name
        if not source.is_file():
            raise FileNotFoundError(f"Submission file missing: {source}")
        out.write(source, name)
    out.writestr(
        "SUBMISSION_README.txt",
        "Ghost Data Still Exists submission bundle\\n"
        "Extract this archive before uploading.\\n"
        "1. Upload code.zip to the code field.\\n"
        "2. Upload output.csv to the predictions field.\\n"
        "3. Upload log.txt to the chat_transcript field.\\n"
        "4. If the challenge asks for agent-trace.zip, export the genuine\\n"
        "   session trace files as described in agent_trace_instructions.md.\\n"
        "   No historical agent trace is included in this archive.\\n"
        "5. Review code/evaluation/evaluation_report.md inside code.zip.\\n"
        "   A successful pipeline is not proof of hidden-grader accuracy.\\n",
    )
with ZipFile(bundle) as archive:
    expected = set(bundle_files + ["SUBMISSION_README.txt"])
    assert expected == set(archive.namelist()), "Incomplete convenience bundle"
print("Created:", bundle, "files:", bundle_files)
