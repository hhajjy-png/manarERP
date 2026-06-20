import base64, os

_DIR = os.path.dirname(os.path.abspath(__file__))

LOGO = base64.b64encode(open(os.path.join(_DIR, 'logo_tight.png'), 'rb').read()).decode()
LOGO_T = base64.b64encode(open(os.path.join(_DIR, 'logo_transparent.png'), 'rb').read()).decode()
BLUE = "#30246C"

# ----- Cairo font embedded (base64) — fully offline, no internet -----
# Same font manarERP uses. Arabic+Latin merged into one file per weight.
_FONT_DIR = os.path.join(_DIR, 'fonts')


def _b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode()


def _face(weight):
    data = _b64(os.path.join(_FONT_DIR, 'cairo-full-%s.woff2' % weight))
    return (
        "@font-face{font-family:'Cairo';font-style:normal;"
        "font-weight:%s;font-display:swap;"
        "src:url(data:font/woff2;base64,%s) format('woff2');}" % (weight, data)
    )


_FACES = "".join(_face(w) for w in (400, 600, 700, 800))

FONT_CSS = _FACES + """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; -weasy-hyphens: none; }
body { margin:0; font-family:'Cairo', sans-serif; color:#000; }
.page { width:210mm; height:297mm; position:relative; background:#fff; overflow:hidden; }
.ar { direction:rtl; text-align:right; }
.en { direction:ltr; text-align:left; }
"""
