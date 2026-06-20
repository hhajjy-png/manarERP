import sys, fitz
from weasyprint import HTML
def render(htmlstr, name, dpi=150):
    HTML(string=htmlstr).write_pdf(f"{name}.pdf")
    doc=fitz.open(f"{name}.pdf")
    pg=doc[0]
    pix=pg.get_pixmap(dpi=dpi)
    pix.save(f"{name}.png")
    print(f"{name}.png  {pix.width}x{pix.height}")
