"""HackerRank required Python entrypoint; Node 18+ runs the audit engine."""
from pathlib import Path
import subprocess
import sys

if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    try:
        raise SystemExit(subprocess.call(["node", str(root / "code" / "main.js")], cwd=root))
    except FileNotFoundError:
        sys.exit("Node.js 18+ is required. Install Node and rerun python3 code/main.py.")
