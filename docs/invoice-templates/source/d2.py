from common import LOGO, BLUE, FONT_CSS
from data import DATA as D

def rows():
    return "".join(
      f'<tr><td class="n">{i}</td><td class="ds">{a}</td><td class="u">{u}</td><td class="q">{q}</td><td class="pr">{up}</td><td class="t">{tp}</td></tr>'
      for i,(a,u,q,up,tp) in enumerate(D["items"],1))

def html():
  return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
.page {{ display:block; }}
.bar {{ height:5mm; background:{BLUE}; }}
.head {{ width:100%; padding:7mm 12mm 4mm 12mm; display:flex; justify-content:space-between; align-items:center; }}
.brand {{ width:60%; display:flex; align-items:center; }}
.brand img {{ width:17mm; margin-left:5mm; }}
.txt {{ direction:rtl; }}
.cn-ar {{ font-weight:800; font-size:15pt; color:{BLUE}; line-height:1.1; white-space:nowrap; }}
.cn-sub {{ font-size:7.6pt; color:#000; margin-top:.8mm; white-space:nowrap; }}
.cn-en {{ font-weight:800; font-size:8pt; color:{BLUE}; margin-top:.8mm; letter-spacing:.2px; }}
.invtitle {{ width:38%; text-align:left; }}
.invtitle .h {{ font-weight:800; font-size:24pt; color:{BLUE}; letter-spacing:1.5px; line-height:1; }}
.invtitle .ar {{ font-weight:700; font-size:11pt; color:#000; }}
.metawrap {{ width:100%; padding:0 12mm; display:flex; }}
.mbox {{ flex:1; border-top:2px solid {BLUE}; padding:3mm 0 0 0; margin-left:6mm; direction:rtl; }}
.mbox:last-child {{ margin-left:0; }}
.mrow {{ display:flex; font-size:9.3pt; margin-bottom:1.5mm; }}
.mrow b {{ color:{BLUE}; font-weight:800; width:30mm; }}
.mrow span {{ color:#000; }}
table {{ width:100%; margin-top:6mm; border-collapse:collapse; direction:rtl; }}
table .pad {{ }}
thead th {{ background:{BLUE}; color:#fff; font-weight:700; font-size:9pt; padding:2.6mm 2mm; text-align:center; }}
tbody td {{ border-bottom:1px solid #cdccdf; padding:2.8mm 2mm; font-size:9.5pt; text-align:center; color:#000; }}
tbody td.ds {{ text-align:right; padding-right:4mm; }}
tbody tr:nth-child(even) td {{ background:#f5f4fb; }}
.n {{ width:7%; }} .ds {{ width:43%; }} .u {{ width:11%; }} .q {{ width:11%; }} .pr {{ width:14%; }} .t {{ width:14%; font-weight:800; color:{BLUE}; }}
.tedge {{ padding-left:12mm; padding-right:12mm; }}
.words {{ direction:rtl; margin:5mm 12mm 0 12mm; font-size:9pt; color:#000; background:#f5f4fb; border-right:3px solid {BLUE}; padding:2.5mm 3mm; }}
.words b {{ color:{BLUE}; }}
.bottom {{ width:100%; display:flex; justify-content:space-between; padding:5mm 12mm 0 12mm; direction:rtl; }}
.left {{ width:53%; }} .right {{ width:42%; }}
.sec-h {{ font-weight:800; color:{BLUE}; font-size:9.5pt; margin-bottom:1.5mm; border-bottom:1px solid {BLUE}; padding-bottom:1mm; }}
.sec-b {{ font-size:8.8pt; line-height:1.7; color:#000; }}
.tr {{ display:flex; justify-content:space-between; font-size:10pt; padding:2mm 1mm; border-bottom:1px solid #d8d7e6; }}
.tr b {{ font-weight:700; color:#000; }}
.grand {{ background:{BLUE}; color:#fff; padding:3mm; font-size:12pt; font-weight:800; display:flex; justify-content:space-between; margin-top:1.5mm; }}
.sign {{ width:100%; display:flex; justify-content:space-between; direction:rtl; padding:0 12mm; margin-top:14mm; }}
.s {{ text-align:center; width:30%; }}
.lbl {{ font-size:9pt; font-weight:800; color:{BLUE}; margin-bottom:12mm; }}
.ln {{ border-top:1px solid #000; padding-top:1mm; font-size:8pt; color:#000; }}
.footbar {{ height:4mm; background:{BLUE}; position:absolute; bottom:0; left:0; right:0; }}
.contactbar {{ position:absolute; bottom:4mm; left:0; right:0; text-align:center; direction:rtl; font-size:7.6pt; color:{BLUE}; padding:2mm; }}
</style></head><body><div class="page">
  <div class="bar"></div>
  <div class="head">
    <div class="brand"><img src="data:image/png;base64,{LOGO}">
      <div class="txt"><div class="cn-ar">شركة المنار الدولية</div>
        <div class="cn-sub">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
        <div class="cn-en">AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    </div>
    <div class="invtitle"><div class="h">INVOICE</div><div class="ar">فاتورة نقداً / بالحساب</div></div>
  </div>
  <div class="metawrap">
    <div class="mbox">
      <div class="mrow"><b>رقم الفاتورة</b><span>{D['inv']}</span></div>
      <div class="mrow"><b>التاريخ</b><span>{D['date']}</span></div>
    </div>
    <div class="mbox">
      <div class="mrow"><b>العميل / السادة</b><span>{D['client_ar']}</span></div>
      <div class="mrow"><b>المشروع</b><span>{D['project_ar']}</span></div>
      <div class="mrow"><b>موقع المشروع</b><span>{D['location_ar']}</span></div>
    </div>
  </div>
  <div class="tedge">
  <table>
    <thead><tr><th class="n">م</th><th>البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody>{rows()}</tbody>
  </table>
  </div>
  <div class="words"><b>المبلغ كتابةً: </b>{D['words']}</div>
  <div class="bottom">
    <div class="left">
      <div class="sec-h">شروط الدفع</div><div class="sec-b">السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
    </div>
    <div class="right">
      <div class="tr"><b>المجموع الفرعي</b><span>{D['subtotal']} د.ك</span></div>
      <div class="grand"><span>الإجمالي النهائي</span><span>{D['total']} د.ك</span></div>
    </div>
  </div>
  <div class="sign">
    <div class="s"><div class="lbl">المحاسبة</div><div class="ln">التوقيع</div></div>
    <div class="s"><div class="lbl">الختم</div><div class="ln">&nbsp;</div></div>
    <div class="s"><div class="lbl">المسؤول / المعتمد</div><div class="ln">التوقيع</div></div>
  </div>
  <div class="contactbar">99333820 / 94404401 &nbsp;|&nbsp; واتساب 98777887 &nbsp;|&nbsp; Manar.int.co@gmail.com</div>
  <div class="footbar"></div>
</div></body></html>"""
