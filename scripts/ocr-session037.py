"""
OCR 처리: 포가튼 렐릭-독수리의손_compressed.pdf
293페이지 이미지 PDF → session-037 소스 마크다운 갱신
"""
import pdfplumber
import pytesseract
import os
import sys
import re
from pathlib import Path

os.environ["TESSDATA_PREFIX"] = r"C:\Users\sj\tessdata"
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PDF_PATH = r"C:\Users\sj\Downloads\LOG DATA\포가튼 렐릭-독수리의손_compressed.pdf"
OUT_MD   = r"C:\Users\sj\Documents\Codex\2026-05-24\c-users-sj-downloads-log-data\repo\source\rp-logs\forgotten-relic\session-037-compressed.md"

# FoundryVTT UI noise patterns to remove
NOISE_PATTERNS = [
    r"Gamemaster\s+@\s*",
    r"\b(ACTION|BONUS ACTION|REACTION|TURN|REACH|TARGETED|SELECTED|DAMAGE|EMANATION)\b",
    r"\b(1d\d+[kh\d+]*|2d\d+[kh\d+]*|d\d+)\b",  # dice notation
    r"\b\d{1,4}FT\b",   # range indicators
    r"hp:\s*\d+\s*->\s*\d+",
    r"heals?\s+\d+\s+HP",
    r"takes?\s+a\s+long\s+rest",
    r"hit\s+points?\s+and\s+\d+\s+hit\s+dic",
    r"©|®|\xa9",
]

def clean_ocr(text: str) -> str:
    # Remove obvious noise
    for pat in NOISE_PATTERNS:
        text = re.sub(pat, "", text, flags=re.IGNORECASE)

    lines = []
    for line in text.splitlines():
        line = line.strip()
        # Skip very short lines or lines that are pure numbers/symbols
        if len(line) < 2:
            continue
        if re.fullmatch(r"[\d\s\+\-\*\/\(\)\[\]\{\}\.\,\:\;\!\?©®%x>v<\|\\]+", line):
            continue
        # Remove lines that start with system-looking prefixes
        if re.match(r"^(bc|l|x|f|v|×|@)\s+\d", line):
            continue
        lines.append(line)

    # Rejoin spaced-out Korean syllables
    # Heuristic: sequences of single Korean syllable blocks separated by single spaces
    result = "\n".join(lines)
    # Join Korean characters that were split by spaces
    result = re.sub(
        r"([가-힣])\s+([가-힣])",
        r"\1\2",
        result
    )
    # Run multiple times to handle longer sequences
    for _ in range(8):
        result = re.sub(
            r"([가-힣])\s+([가-힣])",
            r"\1\2",
            result
        )
    return result.strip()


def process_pdf():
    print(f"Opening: {PDF_PATH}", flush=True)
    pages_text = []

    with pdfplumber.open(PDF_PATH) as pdf:
        total = len(pdf.pages)
        print(f"Total pages: {total}", flush=True)

        for i, page in enumerate(pdf.pages):
            try:
                img = page.to_image(resolution=200).original
                raw = pytesseract.image_to_string(img, lang="kor+eng")
                cleaned = clean_ocr(raw)
                if cleaned:
                    pages_text.append(f"<!-- page {i+1} -->\n{cleaned}")
                if (i + 1) % 20 == 0:
                    print(f"  Processed {i+1}/{total} pages...", flush=True)
            except Exception as e:
                pages_text.append(f"<!-- page {i+1} -- OCR error: {e} -->")

    full_text = "\n\n".join(pages_text)
    print(f"\nTotal extracted: {len(full_text)} chars", flush=True)

    # Write output
    header = """---
id: "raw-session-037"
type: "raw_source"
source_type: "rp_log"
title: "포가튼 렐릭-독수리의손 원문 로그 (OCR)"
date_played: ""
processed: "true"
ocr_engine: "tesseract-5.4-kor"
related_summary: "src/content/sessions/session-037.md"
---
# 포가튼 렐릭-독수리의손 원문 로그 (OCR)

> ⚠️ 이 문서는 이미지 PDF를 Tesseract OCR로 추출한 결과입니다.
> FoundryVTT UI 노이즈가 혼재하며, 특히 전투 수치나 시스템 메시지는 불완전하게 남아 있을 수 있습니다.
> 원문 확인이 필요한 경우 원본 PDF를 직접 열람하세요.

---

"""
    Path(OUT_MD).write_text(header + full_text, encoding="utf-8")
    print(f"Written to: {OUT_MD}", flush=True)


if __name__ == "__main__":
    process_pdf()
