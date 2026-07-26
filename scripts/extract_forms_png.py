import fitz
import os

PDF_PATH = r"c:\Users\hhajj\Claude\Projects\manarERP\docs\AlManar_Official_Forms_v2.pdf"
OUT_DIR  = r"c:\Users\hhajj\Claude\Projects\manarERP\frontend\src\assets\forms"

doc = fitz.open(PDF_PATH)
print(f"PDF opened: {len(doc)} pages")

for i in range(len(doc)):
    page = doc[i]
    # 300 DPI: zoom = 300 / 72
    zoom = 300 / 72
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    filename = f"hr-frm-{i+1:03d}.png"
    out_path = os.path.join(OUT_DIR, filename)
    pix.save(out_path)
    print(f"  Page {i+1} -> {filename}  ({pix.width}x{pix.height} px)")

doc.close()
print("Done.")
