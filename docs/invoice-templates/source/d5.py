from common import LOGO, LOGO_T, BLUE, FONT_CSS
from data import DATA as D
def rows():
    r="".join(
      f'<tr><td class="ds">{a}</td><td>{u}</td><td>{q}</td><td>{up}</td><td class="t">{tp}</td></tr>'
      for (a,u,q,up,tp) in D["items"])
    r+="".join('<tr class="e"><td></td><td></td><td></td><td></td><td></td></tr>' for _ in range(5))
    return r
def html():
  return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
.page {{ padding:9mm 11mm; }}
.hdr {{ width:100%; display:flex; justify-content:space-between; align-items:flex-start; }}
.hL {{ width:33%; }} .hC {{ width:30%; text-align:center; }} .hR {{ width:33%; direction:rtl; text-align:right; }}
.en-n {{ font-weight:800; font-size:11pt; color:{BLUE}; line-height:1.05; }}
.en-t {{ font-size:6.6pt; color:#000; font-weight:600; margin-top:1mm; }}
.en-c {{ font-size:7pt; color:{BLUE}; margin-top:2.5mm; line-height:1.7; }}
.ar-n {{ font-weight:800; font-size:14pt; color:{BLUE}; line-height:1.05; }}
.ar-t {{ font-size:7pt; color:#000; font-weight:600; margin-top:1mm; }}
.ar-c {{ font-size:7.4pt; color:{BLUE}; margin-top:2.5mm; line-height:1.7; }}
.logo {{ width:22mm; }}
.title {{ margin-top:1.5mm; }}
.title .a {{ font-weight:800; font-size:12pt; color:{BLUE}; }}
.title .b {{ font-weight:800; font-size:10pt; color:{BLUE}; }}
.rule {{ width:100%; border-top:2px solid {BLUE}; margin:3mm 0; }}
.meta {{ width:100%; display:flex; direction:rtl; border:1.2px solid {BLUE}; }}
.meta .c {{ flex:1; padding:1.8mm 3mm; font-size:9pt; border-left:1px solid #cfcee0; direction:rtl; }}
.meta .c:last-child {{ border-left:none; }}
.meta .c b {{ color:{BLUE}; font-weight:800; }}
.meta .full {{ flex:2; }}
table {{ width:100%; border-collapse:collapse; direction:rtl; margin-top:4mm; }}
thead th {{ border:1.2px solid {BLUE}; color:{BLUE}; font-weight:800; font-size:9.5pt; padding:2.4mm 1mm; text-align:center; background:#f2f1f9; }}
tbody td {{ border:1px solid {BLUE}; padding:2.6mm 2mm; font-size:9.5pt; text-align:center; height:7.6mm; color:#000; }}
tbody td.ds {{ text-align:right; padding-right:4mm; }}
tbody .e td {{ height:7.6mm; }}
.ds {{ width:46%; }} .t {{ font-weight:800; color:{BLUE}; }}
.belt {{ width:100%; display:flex; direction:rtl; margin-top:4mm; }}
.words {{ flex:1; border:1.2px solid {BLUE}; padding:2.6mm 3mm; font-size:9pt; margin-left:5mm; direction:rtl; }}
.words b {{ color:{BLUE}; }}
.tot {{ width:62mm; border:1.2px solid {BLUE}; direction:rtl; }}
.tot .r {{ display:flex; justify-content:space-between; padding:1.8mm 3mm; font-size:9.5pt; border-bottom:1px solid #cfcee0; }}
.tot .r b {{ color:#000; font-weight:700; }}
.tot .g {{ background:{BLUE}; color:#fff; font-weight:800; font-size:11pt; padding:2.6mm 3mm; display:flex; justify-content:space-between; }}
.secrow {{ width:100%; display:flex; direction:rtl; margin-top:5mm; }}
.sec {{ flex:1; direction:rtl; margin-left:5mm; }}
.sec:last-child {{ margin-left:0; }}
.sec .h {{ font-weight:800; color:{BLUE}; font-size:9.5pt; border-bottom:1.5px solid {BLUE}; padding-bottom:1mm; margin-bottom:1.5mm; }}
.sec .b {{ font-size:8.8pt; line-height:1.75; color:#000; }}
.sign {{ width:100%; display:flex; justify-content:space-between; direction:rtl; margin-top:16mm; }}
.s {{ width:30%; text-align:center; }}
.s .lbl {{ font-weight:800; color:{BLUE}; font-size:10pt; margin-bottom:13mm; }}
.s .ln {{ border-top:1.4px solid {BLUE}; padding-top:1mm; font-size:8pt; color:#000; }}
</style></head><body><div class="page">
  <div class="hdr">
    <div class="hL"><div class="en-n">Al Manar Al Duwaliya Co. <span style="font-size:7pt">L.L.C</span></div>
      <div class="en-t">For construction & maintenance of roads, streets, pavements and road supplies</div>
      <div class="en-c">Tel: 99333820 / 94404401<br>WhatsApp: 98777887<br>Manar.int.co@gmail.com</div></div>
    <div class="hC"><img class="logo" src="data:image/png;base64,{LOGO}">
      <div class="title"><div class="a">فاتورة نقداً / بالحساب</div><div class="b">Cash / Credit Invoice</div></div></div>
    <div class="hR"><div class="ar-n">شركة المنار الدولية ذ.م.م</div>
      <div class="ar-t">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div class="ar-c">هاتف: 99333820 / 94404401<br>واتساب: 98777887<br>رأس المال المدفوع ٥٠٠،٠٠٠ د.ك</div></div>
  </div>
  <div class="rule"></div>
  <div class="meta">
    <div class="c"><b>رقم الفاتورة:</b> {D['inv']}</div>
    <div class="c"><b>التاريخ:</b> {D['date']}</div>
    <div class="c full"><b>المطلوب من السادة:</b> {D['client_ar']}</div>
  </div>
  <div class="meta" style="border-top:none;">
    <div class="c full"><b>المشروع:</b> {D['project_ar']}</div>
    <div class="c full"><b>موقع المشروع:</b> {D['location_ar']}</div>
  </div>
  <table>
    <thead><tr><th class="ds">البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody>{rows()}</tbody>
  </table>
  <div class="belt">
    <div class="words"><b>المبلغ كتابةً:</b><br>{D['words']}</div>
    <div class="tot">
      <div class="r"><b>المجموع الفرعي</b><span>{D['subtotal']} د.ك</span></div>
      <div class="g"><span>الإجمالي النهائي</span><span>{D['total']} د.ك</span></div>
    </div>
  </div>
  <div class="secrow">
    <div class="sec"><div class="h">شروط الدفع</div><div class="b">السداد خلال 30 يوماً من تاريخ الفاتورة.</div></div>
    <div class="sec"><div class="h">ملاحظات</div><div class="b" style="min-height:16mm;"></div></div>
  </div>
  <div class="sign">
    <div class="s"><div class="lbl">المحاسبة</div><div class="ln">التوقيع</div></div>
    <div class="s"><div class="lbl">الختم الرسمي</div><div class="ln">&nbsp;</div></div>
    <div class="s"><div class="lbl">المسؤول</div><div class="ln">التوقيع</div></div>
  </div>
</div></body></html>"""
