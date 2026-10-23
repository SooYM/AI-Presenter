"""Bounded, offline text extraction for one already-private PDF page."""
import pathlib
import sys
from pypdf import PdfReader

if len(sys.argv) != 3:
    raise SystemExit(2)
source = pathlib.Path(sys.argv[1]).resolve()
page = int(sys.argv[2])
if source.name != "deck.pdf" or not source.is_file() or source.stat().st_size > 30 * 1024 * 1024 or page < 1 or page > 40:
    raise SystemExit(2)
reader = PdfReader(str(source))
if reader.is_encrypted or len(reader.pages) > 40 or page > len(reader.pages):
    raise SystemExit(2)
text = reader.pages[page - 1].extract_text() or ""
sys.stdout.buffer.write(text[:24000].encode("utf-8"))
