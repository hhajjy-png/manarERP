from common import LOGO, BLUE, FONT_CSS
from data import DATA as D
def rows():
    r="".join(
      f'<tr><td class="n">{i}</td><td class="ds">{a}</td><td>{u}</td><td>{q}</td><td>{up}</td><td class="t">{tp}</td></tr>'
      for i,(a,u,q,up,tp) in enumerate(D["items"],1))
    r+="".join('<tr class="empty"><td class="n">&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>' for _ in range(6))
    return r
def html():
  return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
.page {{ padding:9mm 10mm; display:flex; flex-direction:column; }}
.strip {{ width:100%; border:1.5px solid {BLUE}; display:flex; direction:rtl; }}
.s-logo {{ width:24mm; border-left:1.5px solid {BLUE}; display:flex; align-items:center; justify-content:center; padding:2mm; }}
.s-logo img {{ width:16mm; }}
.s-name {{ flex:1; padding:2.5mm 4mm; direction:rtl; }}
.s-name .a {{ font-weight:800; font-size:14.5pt; color:{BLUE}; line-height:1.1; }}
.s-name .b {{ font-size:7.6pt; color:#000; margin-top:.6mm; }}
.s-name .c {{ font-weight:700; font-size:7.4pt; color:{BLUE}; margin-top:.6mm; }}
.s-meta {{ width:50mm; border-right:1.5px solid {BLUE}; direction:rtl; }}
.s-meta .mh {{ background:{BLUE}; color:#fff; text-align:center; font-weight:800; font-size:9.5pt; padding:1.3mm; letter-spacing:1px; }}
.s-meta .mr {{ display:flex; justify-content:space-between; padding:1.4mm 2.5mm; font-size:8.4pt; border-bottom:1px solid #cfcee0; }}
.s-meta .mr:last-child {{ border-bottom:none; }}
.s-meta .mr b {{ color:{BLUE}; font-weight:800; }}
.clientrow {{ width:100%; border:1.5px solid {BLUE}; border-top:none; display:flex; direction:rtl; }}
.clientrow .cell {{ flex:1; padding:1.8mm 4mm; font-size:8.8pt; direction:rtl; border-left:1px solid #cfcee0; }}
.clientrow .cell:last-child {{ border-left:none; }}
.clientrow .cell b {{ color:{BLUE}; font-weight:800; }}
table {{ width:100%; border-collapse:collapse; direction:rtl; margin-top:4mm; }}
thead th {{ background:{BLUE}; color:#fff; font-weight:700; font-size:9pt; padding:2.4mm 1mm; text-align:center; border:1px solid {BLUE}; }}
tbody td {{ border:1px solid #9d9cba; padding:2.5mm 2mm; font-size:9.3pt; text-align:center; height:7mm; color:#000; }}
tbody td.ds {{ text-align:right; padding-right:3.5mm; }}
tbody .empty td {{ height:7mm; }}
.n {{ width:6%; }} .ds {{ width:44%; }} .t {{ font-weight:800; color:{BLUE}; }}
tfoot td {{ border:1px solid {BLUE}; font-weight:700; font-size:9.5pt; padding:2.2mm 2mm; }}
tfoot .lab {{ text-align:right; padding-right:3.5mm; color:{BLUE}; font-weight:800; background:#eeedf6; }}
tfoot .val {{ text-align:center; }}
tfoot .grand td {{ background:{BLUE}; color:#fff; font-size:11pt; font-weight:800; }}
.words {{ width:100%; direction:rtl; border:1.5px solid {BLUE}; border-top:none; padding:2.2mm 3mm; font-size:9pt; }}
.words b {{ color:{BLUE}; }}
.bottom {{ width:100%; display:flex; direction:rtl; margin-top:5mm; }}
.terms {{ flex:1; border:1.2px solid {BLUE}; margin-left:5mm; direction:rtl; }}
.terms .h {{ background:#eeedf6; color:{BLUE}; font-weight:800; font-size:9pt; padding:1.6mm 3mm; border-bottom:1.2px solid {BLUE}; }}
.terms .b {{ padding:2.4mm 3mm; font-size:8.6pt; line-height:1.7; }}
.sign {{ width:55mm; }}
.sbox {{ border:1.2px solid {BLUE}; text-align:center; margin-bottom:4mm; }}
.sbox .h {{ background:#eeedf6; color:{BLUE}; font-weight:800; font-size:8.6pt; padding:1.4mm; border-bottom:1.2px solid {BLUE}; }}
.sbox .b {{ height:15mm; }}
.fbar {{ width:100%; margin-top:auto; border-top:2px solid {BLUE}; padding-top:2mm; text-align:center; direction:rtl; font-size:8pt; color:{BLUE}; }}
</style></head><body><div class="page">
  <div class="strip">
    <div class="s-logo"><img src="data:image/png;base64,{LOGO}"></div>
    <div class="s-name"><div class="a">شركة المنار الدولية ذ.م.م</div>
      <div class="b">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق — رأس المال ٥٠٠،٠٠٠ د.ك</div>
      <div class="c">AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    <div class="s-meta"><div class="mh">فاتورة / INVOICE</div>
      <div class="mr"><b>رقم</b><span>{D['inv']}</span></div>
      <div class="mr"><b>التاريخ</b><span>{D['date']}</span></div>
    </div>
  </div>
  <div class="clientrow">
    <div class="cell"><b>العميل:</b> {D['client_ar']}</div>
    <div class="cell"><b>المشروع:</b> {D['project_ar']}</div>
    <div class="cell"><b>الموقع:</b> {D['location_ar']}</div>
  </div>
  <table>
    <thead><tr><th class="n">م</th><th>البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody>{rows()}</tbody>
    <tfoot>
      <tr><td class="lab" colspan="5">المجموع الفرعي</td><td class="val">{D['subtotal']}</td></tr>
      <tr class="grand"><td colspan="5" style="text-align:right;padding-right:3.5mm;">الإجمالي النهائي (د.ك)</td><td class="val">{D['total']}</td></tr>
    </tfoot>
  </table>
  <div class="words"><b>المبلغ كتابةً: </b>{D['words']}</div>
  <div class="bottom">
    <div class="terms">
      <div class="h">شروط الدفع</div>
      <div class="b">السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
      <div class="h" style="margin-top:4mm;">ملاحظات</div>
      <div class="b" style="min-height:16mm;"></div>
    </div>
    <div class="sign">
      <div class="sbox"><div class="h">المحاسبة</div><div class="b"></div></div>
      <div class="sbox"><div class="h">المسؤول / الختم</div><div class="b"></div></div>
    </div>
  </div>
  <div class="fbar">هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
</div></body></html>"""
