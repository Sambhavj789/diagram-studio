"""Render a diagram-studio DSL file to PNG (for python-docx / Word reports).

No package needed: it shells out to cli.js and reads the one-line JSON.

    python examples/python_figure.py examples/report-pipeline.txt out/report.png --scale 2

From another project (e.g. personal/ai-report):

    from examples.python_figure import render
    path = render("figures/architecture.dsl", "figures/architecture.png")
    body += "\\n![](" + path + ")\\n"

The PNG path always uses forward slashes so Markdown/Word accept it.
"""

import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.dirname(HERE)


def render(src, out_png, theme="light", scale=2, transparent=False, studio=STUDIO):
    """Convert src (a .dsl/.txt path) to out_png; returns the path with forward slashes."""
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    cmd = [
        os.environ.get("NODE", "node"),
        os.path.join(studio, "cli.js"),
        src,
        "-o",
        out_png,
        "--theme",
        theme,
        "--scale",
        str(scale),
        "--json",
    ]
    if transparent:
        cmd.append("--transparent")

    run = subprocess.run(cmd, capture_output=True, text=True, check=False)
    lines = [line for line in run.stdout.splitlines() if line.strip()]
    data = json.loads(lines[-1]) if lines else {}
    if run.returncode != 0 or not data.get("ok"):
        raise RuntimeError("diagram-studio failed: " + (run.stderr.strip() or run.stdout.strip()))
    return out_png.replace("\\", "/")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("src", help="DSL or text file")
    parser.add_argument("out", help="PNG output path")
    parser.add_argument("--theme", default="light", choices=["light", "dark"])
    parser.add_argument("--scale", type=int, default=2, choices=[1, 2, 3])
    parser.add_argument("--transparent", action="store_true")
    args = parser.parse_args(argv)

    print(render(args.src, args.out, args.theme, args.scale, args.transparent))
    return 0


if __name__ == "__main__":
    sys.exit(main())
