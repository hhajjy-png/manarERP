from common import LOGO, LOGO_T, BLUE, FONT_CSS

def html():
    rows = "".join(
        f'<tr><td class="c-desc"></td><td class="c-qty"></td><td class="c-d"></td><td class="c-f"></td><td class="c-d"></td><td class="c-f"></td></tr>'
        for _ in range(20))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
.p {{ padding:5mm 8mm 7mm 8mm; height:297mm; display:flex; flex-direction:column; }}
.hdr {{ display:flex; justify-content:space-between; align-items:flex-start; }}
.hL {{ width:34%; }}
.hC {{ width:24%; text-align:center; }}
.hR {{ width:34%; direction:rtl; text-align:right; }}
.cname-en {{ font-weight:800; font-size:12.5pt; color:{BLUE}; line-height:1.05; }}
.tag-en {{ font-weight:700; font-size:6.4pt; color:{BLUE}; margin-top:1mm; }}
.cap-en {{ font-size:7.2pt; color:{BLUE}; margin-top:.3mm; }}
.cname-ar {{ font-weight:800; font-size:15pt; color:{BLUE}; line-height:1; }}
.tag-ar {{ font-weight:700; font-size:7pt; color:{BLUE}; margin-top:1mm; }}
.cap-ar {{ font-size:7.5pt; color:{BLUE}; margin-top:.3mm; }}
.contact {{ font-size:7.4pt; color:{BLUE}; margin-top:1.5mm; line-height:1.55; }}
.contact span {{ font-weight:800; }}
.logo {{ width:26mm; }}
.title {{ text-align:center; margin-top:0.5mm; margin-bottom:1mm; }}
.title .a {{ font-weight:800; font-size:13pt; color:{BLUE}; }}
.title .b {{ font-weight:800; font-size:11pt; color:{BLUE}; letter-spacing:.3px; }}
.meta {{ direction:rtl; display:flex; flex-direction:column; font-size:9.5pt; color:{BLUE}; font-weight:700; margin:1mm 1mm 1.5mm 1mm; }}
.m-date {{ margin-bottom:1.8mm; }}
.m-to {{ display:flex; align-items:flex-end; }}
.dotline {{ flex:1; border-bottom:1px dotted {BLUE}; margin:0 2mm; transform:translateY(-3px); }}
table {{ width:100%; border-collapse:collapse; direction:ltr; }}
th,td {{ border:1px solid {BLUE}; text-align:center; vertical-align:middle; }}
thead th {{ color:{BLUE}; font-weight:800; padding:1mm; }}
.grp {{ font-size:9.5pt; }} .sub {{ font-size:8pt; font-weight:700; }}
.c-desc {{ width:38%; }} .c-qty {{ width:13%; }} .c-d {{ width:13%; }} .c-f {{ width:6.5%; }}
tbody td {{ height:8mm; }}
.deschead {{ font-size:10pt; }} .descsub {{ font-size:8.5pt; }}
.totrow td {{ color:{BLUE}; font-weight:800; padding:1.6mm 2mm; font-size:10pt; }}
.tot-label {{ text-align:center; }}
.foot {{ direction:rtl; display:flex; justify-content:space-between; font-size:10pt; color:{BLUE}; font-weight:700; margin-top:4mm; }}
.foot .ln {{ display:inline-block; width:46mm; border-bottom:1px dotted {BLUE}; margin:0 2mm; transform:translateY(-3px); }}
.wm {{ position:absolute; top:46%; left:50%; transform:translate(-50%,-50%); width:70mm; opacity:.06; }}
</style></head><body><div class="page"><img class="wm" src="data:image/png;base64,{LOGO_T}">
<div class="p">
  <div class="hdr">
    <div class="hL en">
      <div class="cname-en">Al Manar Al Duwaliya Company <span style="font-size:7pt">L.L.C</span></div>
      <div class="tag-en">For construction and maintenance of roads streets pavements and road supplies</div>
      <div class="cap-en">Paid-up capital: 500,000 thousand K.D.</div>
      <div class="contact">
        <span>&#9742;</span> : 99333820 / 94404401<br>
        <span>&#9743;</span> : 98777887<br>
        <span>&#9993;</span> : Manar.int.co@gmail.com
      </div>
    </div>
    <div class="hC"><img class="logo" src="data:image/png;base64,{LOGO}"></div>
    <div class="hR ar">
      <div class="cname-ar">شركة المنار الدولية <span style="font-size:9pt">ذ.م.م</span></div>
      <div class="tag-ar">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div class="cap-ar">رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
      <div class="contact">
        99333820 / 94404401 : <span>&#9742;</span><br>
        98777887 : <span>&#9743;</span><br>
        Manar.int.co@gmail.com : <span>&#9993;</span>
      </div>
    </div>
  </div>
  <div class="title"><div class="a">فاتورة نقداً / بالحساب</div><div class="b">Cash / Credit Invoice</div></div>
  <div class="meta">
    <div class="m-date">التاريخ : &nbsp;&nbsp;/&nbsp;&nbsp;/&nbsp; 20&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
    <div class="m-to"><span>المطلوب من السيد / السادة :</span><span class="dotline"></span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="c-desc" rowspan="2"><div class="deschead">ملاحظات</div><div class="descsub">Description</div></th>
        <th class="c-qty" rowspan="2"><div class="grp">الكمية</div><div class="sub">طن / درب</div></th>
        <th colspan="2"><div class="grp">سعر الوحدة</div><div class="sub">Unit Price</div></th>
        <th colspan="2"><div class="grp">القيمة</div><div class="sub">Total Price</div></th>
      </tr>
      <tr>
        <th class="sub">دينار K.D</th><th class="sub">فلس Fils</th>
        <th class="sub">دينار K.D</th><th class="sub">فلس Fils</th>
      </tr>
    </thead>
    <tbody>{rows}</tbody>
    <tfoot>
      <tr class="totrow"><td colspan="6"><div style="display:flex;justify-content:space-between;direction:rtl;align-items:center;"><span>القيمة الإجمالية مبلغ وقدره ...........................................................................</span><span style="direction:ltr;">Total :</span></div></td></tr>
    </tfoot>
  </table>
  <div class="foot">
    <div>المحاسبة : <span class="ln"></span></div>
    <div>المسؤول : <span class="ln"></span></div>
  </div>
</div></div></body></html>"""
