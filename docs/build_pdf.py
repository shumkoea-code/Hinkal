#!/usr/bin/env python3
"""Render cursor-subscription-limits-ru.md to standalone HTML and PDF.

HTML is produced with python-markdown; the PDF is printed by headless Chrome.

    pip install markdown
    python3 docs/build_pdf.py
"""

import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

import markdown

DOCS = Path(__file__).resolve().parent
SOURCE = DOCS / "cursor-subscription-limits-ru.md"
HTML_OUT = DOCS / "cursor-subscription-limits-ru.html"
PDF_OUT = DOCS / "cursor-subscription-limits-ru.pdf"

CHROME_CANDIDATES = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
]

CSS = """
@page { size: A4; margin: 16mm 14mm; }
:root {
  --ink: #1a1c20;
  --muted: #5b6270;
  --rule: #dfe3ea;
  --accent: #2f6feb;
  --surface: #f6f8fb;
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  max-width: 900px;
  padding: 36px 28px 64px;
  font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--ink);
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
h1 {
  font-size: 30px;
  line-height: 1.25;
  margin: 0 0 8px;
  letter-spacing: -0.02em;
}
h2 {
  font-size: 21px;
  margin: 34px 0 12px;
  padding-bottom: 7px;
  border-bottom: 2px solid var(--rule);
  letter-spacing: -0.01em;
  page-break-after: avoid;
}
h3 {
  font-size: 17px;
  margin: 24px 0 8px;
  page-break-after: avoid;
}
h4 { font-size: 15px; margin: 18px 0 6px; }
p, ul, ol { margin: 0 0 12px; }
li { margin: 3px 0; }
li > ul, li > ol { margin: 4px 0 4px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code {
  font: 0.88em/1.5 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 1px 5px;
}
hr {
  border: 0;
  border-top: 1px solid var(--rule);
  margin: 28px 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0 18px;
  font-size: 13.5px;
  page-break-inside: auto;
}
thead { background: var(--surface); }
th, td {
  border: 1px solid var(--rule);
  padding: 6px 9px;
  text-align: left;
  vertical-align: top;
}
th { font-weight: 650; }
tr { page-break-inside: avoid; }
blockquote {
  margin: 14px 0;
  padding: 2px 0 2px 14px;
  border-left: 3px solid var(--accent);
  color: var(--muted);
}
em { color: var(--muted); }
h1 + p strong { font-size: 15px; }
"""


def github_slugify(value: str, separator: str = "-") -> str:
    """Mirror GitHub's heading anchors so in-file TOC links work in both renderers.

    NFC rather than NFKD: decomposing would strip the breve off Cyrillic "й", and
    each whitespace character becomes its own separator instead of being collapsed.
    """
    value = unicodedata.normalize("NFC", value)
    value = re.sub(r"[^\w\s-]", "", value).strip().lower()
    return re.sub(r"\s", separator, value)


def render_html(text: str) -> str:
    md = markdown.Markdown(
        extensions=["tables", "toc", "attr_list", "sane_lists"],
        extension_configs={"toc": {"slugify": github_slugify}},
    )
    body = md.convert(text)
    return (
        "<!DOCTYPE html>\n"
        '<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        "<title>Подписка Cursor: лимиты, тарифы и возможности</title>\n"
        f"<style>{CSS}</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n"
    )


def check_anchors(html: str) -> list[str]:
    ids = set(re.findall(r'<h[1-6][^>]*id="([^"]+)"', html))
    return sorted({a for a in re.findall(r'href="#([^"]+)"', html) if a not in ids})


def find_chrome() -> str | None:
    for name in CHROME_CANDIDATES:
        path = shutil.which(name)
        if path:
            return path
    return None


def print_to_pdf(chrome: str, source: Path, target: Path, deadline_s: float = 180.0) -> None:
    """Print `source` to `target` with headless Chrome.

    Chrome finishes writing the PDF in about a second but then refuses to exit in a
    container, so instead of waiting on the process we wait for the output file to
    stop growing and then shut Chrome down ourselves.
    """
    target.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        process = subprocess.Popen(
            [
                chrome,
                "--headless=old",
                "--disable-gpu",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--no-first-run",
                "--disable-extensions",
                f"--user-data-dir={profile}",
                "--no-pdf-header-footer",
                f"--print-to-pdf={target}",
                source.as_uri(),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            expires = time.monotonic() + deadline_s
            previous = -1
            while time.monotonic() < expires:
                time.sleep(0.5)
                size = target.stat().st_size if target.exists() else 0
                if size and size == previous:
                    return
                previous = size
            raise TimeoutError(f"Chrome did not finish printing within {deadline_s:.0f}s")
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()


def main() -> int:
    html = render_html(SOURCE.read_text(encoding="utf-8"))
    HTML_OUT.write_text(html, encoding="utf-8")
    print(f"wrote {HTML_OUT.relative_to(DOCS.parent)}")

    broken = check_anchors(html)
    if broken:
        print("broken in-page anchors: " + ", ".join(broken), file=sys.stderr)
        return 1

    chrome = find_chrome()
    if not chrome:
        print("no Chrome/Chromium found, skipping PDF", file=sys.stderr)
        return 0

    print_to_pdf(chrome, HTML_OUT, PDF_OUT)
    print(f"wrote {PDF_OUT.relative_to(DOCS.parent)} ({PDF_OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
