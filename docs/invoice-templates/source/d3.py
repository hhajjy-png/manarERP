from common import LOGO, BLUE, FONT_CSS
from data import DATA as D
def rows():
    return "".join(
      f'<tr><td class="n">{i}</td><td class="ds">{a}</td><td>{u}</td><td>{q}</td><td>{up}</td><td class="t">{tp}</td></tr>'
      for i,(a,u,q,up,tp) in enumerate(D["items"],1))
def html():
  return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
.page {{ padding:10mm 11mm; }}
.head {{ width:100%; display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:4mm; border-bottom:3px solid {BLUE}; }}
.brand {{ width:62%; display:flex; align-items:center; }}
.brand img {{ width:18mm; margin-left:5mm; }}
.cn-ar {{ font-weight:800; font-size:16pt; color:{BLUE}; line-height:1.1; white-space:nowrap; direction:rtl; }}
.cn-sub {{ font-size:7.8pt; color:#000; margin-top:1mm; white-space:nowrap; direction:rtl; }}
.cn-en {{ font-weight:800; font-size:8pt; color:{BLUE}; margin-top:1mm; }}
.metabox {{ width:34%; border:1.5px solid {BLUE}; direction:rtl; }}
.metabox .h {{ background:{BLUE}; color:#fff; font-weight:800; font-size:11pt; text-align:center; padding:1.6mm; letter-spacing:1px; }}
.metabox .r {{ display:flex; justify-content:space-between; padding:1.8mm 2.5mm; font-size:9pt; border-bottom:1px solid #d5d4e4; }}
.metabox .r:last-child {{ border-bottom:none; }}
.metabox .r b {{ color:{BLUE}; font-weight:800; }}
.boxes {{ width:100%; display:flex; margin-top:5mm; }}
.box {{ flex:1; border:1.2px solid {BLUE}; direction:rtl; margin-left:5mm; }}
.box:last-child {{ margin-left:0; }}
.box .bh {{ background:#eeedf6; color:{BLUE}; font-weight:800; font-size:9.5pt; padding:1.8mm 3mm; border-bottom:1.2px solid {BLUE}; }}
.box .bb {{ padding:2.6mm 3mm; font-size:9.3pt; line-height:1.85; color:#000; }}
.box .bb b {{ color:{BLUE}; font-weight:700; }}
table {{ width:100%; margin-top:5mm; border-collapse:collapse; direction:rtl; }}
thead th {{ background:{BLUE}; color:#fff; font-weight:700; font-size:9pt; padding:2.6mm 2mm; text-align:center; border:1px solid {BLUE}; }}
tbody td {{ border:1px solid #b9b8cf; padding:2.7mm 2mm; font-size:9.5pt; text-align:center; color:#000; }}
tbody td.ds {{ text-align:right; padding-right:4mm; }}
.n {{ width:7%; }} .ds {{ width:43%; }} .t {{ font-weight:800; color:{BLUE}; }}
.bottom {{ width:100%; display:flex; justify-content:space-between; margin-top:5mm; direction:rtl; }}
.tl {{ width:54%; }} .tr2 {{ width:42%; border:1.2px solid {BLUE}; }}
.tr2 .row {{ display:flex; justify-content:space-between; padding:2.3mm 3mm; font-size:10pt; border-bottom:1px solid #d5d4e4; }}
.tr2 .row b {{ color:#000; }}
.tr2 .grand {{ background:{BLUE}; color:#fff; font-weight:800; font-size:12pt; padding:3mm; display:flex; justify-content:space-between; }}
.sec {{ border:1.2px solid {BLUE}; direction:rtl; }}
.sec .sh {{ background:#eeedf6; color:{BLUE}; font-weight:800; font-size:9pt; padding:1.6mm 3mm; }}
.sec .sb {{ padding:2.4mm 3mm; font-size:8.7pt; line-height:1.7; color:#000; }}
.words {{ direction:rtl; margin-top:5mm; border:1.2px solid {BLUE}; padding:2.5mm 3mm; font-size:9pt; }}
.words b {{ color:{BLUE}; }}
.sign {{ width:100%; display:flex; justify-content:space-between; direction:rtl; margin-top:14mm; }}
.s {{ width:30%; text-align:center; }}
.s .lbl {{ font-weight:800; color:{BLUE}; font-size:9.5pt; margin-bottom:13mm; }}
.s .ln {{ border-top:1.4px solid {BLUE}; padding-top:1mm; font-size:8pt; }}
.fbar {{ width:100%; border-top:3px solid {BLUE}; margin-top:6mm; padding-top:2mm; text-align:center; direction:rtl; font-size:8pt; color:{BLUE}; }}
</style></head><body><div class="page">
  <div class="head">
    <div class="brand"><img src="data:image/png;base64,{LOGO}">
      <div><div class="cn-ar">شركة المنار الدولية ذ.م.م</div>
        <div class="cn-sub">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
        <div class="cn-en">AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    </div>
    <div class="metabox"><div class="h">فاتورة INVOICE</div>
      <div class="r"><b>رقم الفاتورة</b><span>{D['inv']}</span></div>
      <div class="r"><b>التاريخ</b><span>{D['date']}</span></div>
      <div class="r"><b>النوع</b><span>نقداً / بالحساب</span></div>
    </div>
  </div>
  <div class="boxes">
    <div class="box"><div class="bh">بيانات العميل</div>
      <div class="bb"><b>الاسم:</b> {D['client_ar']}<br><b>المسمى:</b> {D['client_en']}</div></div>
    <div class="box"><div class="bh">بيانات المشروع</div>
      <div class="bb"><b>المشروع:</b> {D['project_ar']}<br><b>الموقع:</b> {D['location_ar']}</div></div>
  </div>
  <table>
    <thead><tr><th class="n">م</th><th>البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody>{rows()}</tbody>
  </table>
  <div class="words"><b>المبلغ كتابةً: </b>{D['words']}</div>
  <div class="bottom">
    <div class="tl">
      <div class="sec"><div class="sh">شروط الدفع</div><div class="sb">السداد خلال 30 يوماً من تاريخ الفاتورة.</div></div>
      <div class="sec" style="margin-top:4mm;"><div class="sh">ملاحظات</div><div class="sb" style="min-height:16mm;"></div></div>
    </div>
    <div class="tr2">
      <div class="row"><b>المجموع الفرعي</b><span>{D['subtotal']} د.ك</span></div>
      <div class="grand"><span>الإجمالي النهائي</span><span>{D['total']} د.ك</span></div>
    </div>
  </div>
  <div class="sign">
    <div class="s"><div class="lbl">المحاسبة</div><div class="ln">التوقيع</div></div>
    <div class="s"><div class="lbl">الختم الرسمي</div><div class="ln">&nbsp;</div></div>
    <div class="s"><div class="lbl">المسؤول / المعتمد</div><div class="ln">التوقيع</div></div>
  </div>
  <div class="fbar">هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
</div></body></html>"""
