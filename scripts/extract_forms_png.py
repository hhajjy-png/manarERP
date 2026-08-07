"""أداة تطوير: تحويل صفحات ملف النماذج الرسمية (PDF) إلى صور PNG بدقة 300 DPI.

لا تُشغَّل ضمن البناء ولا تُشحن مع النسخة الإنتاجية — أداة تجهيز أصول تُشغَّل يدويًا
عند تحديث ملف النماذج.

كانت المسارات هنا مثبَّتة على جهاز المطوّر (‎C:\\Users\\...‎) فلا تعمل على أي جهاز آخر
ولا في CI. الآن تُشتق من موقع الملف نفسه، مع إمكانية التجاوز من سطر الأوامر.

الاستخدام:
    python scripts/extract_forms_png.py [PDF_PATH] [OUT_DIR]
"""

from __future__ import annotations

import sys
from pathlib import Path

import fitz  # PyMuPDF

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PDF = REPO_ROOT / "docs" / "AlManar_Official_Forms_v2.pdf"
DEFAULT_OUT = REPO_ROOT / "frontend" / "src" / "assets" / "forms"

RENDER_DPI = 300


def extract(pdf_path: Path, out_dir: Path) -> int:
    if not pdf_path.is_file():
        raise SystemExit(f"ملف PDF غير موجود: {pdf_path}")

    out_dir.mkdir(parents=True, exist_ok=True)
    zoom = RENDER_DPI / 72
    matrix = fitz.Matrix(zoom, zoom)

    with fitz.open(pdf_path) as doc:
        print(f"PDF opened: {len(doc)} pages -> {out_dir}")
        for index, page in enumerate(doc, start=1):
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            out_path = out_dir / f"hr-frm-{index:03d}.png"
            pix.save(out_path)
            print(f"  Page {index} -> {out_path.name}  ({pix.width}x{pix.height} px)")
        return len(doc)


def main(argv: list[str]) -> None:
    pdf_path = Path(argv[0]).resolve() if len(argv) > 0 else DEFAULT_PDF
    out_dir = Path(argv[1]).resolve() if len(argv) > 1 else DEFAULT_OUT
    count = extract(pdf_path, out_dir)
    print(f"Done. {count} page(s).")


if __name__ == "__main__":
    main(sys.argv[1:])
