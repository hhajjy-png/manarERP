export default function InvoiceDesign1Blank() {
  return (
    <>
      <style>{`
body { margin:0; font-family:'Cairo', sans-serif; color:#000; }
.page { width:210mm; height:297mm; position:relative; background:#fff; overflow:hidden; }
.ar { direction:rtl; text-align:right; }
.en { direction:ltr; text-align:left; }

.p { padding:5mm 8mm 7mm 8mm; height:297mm; display:flex; flex-direction:column; }
.hdr { display:flex; justify-content:space-between; align-items:flex-start; }
.hL { width:34%; }
.hC { width:24%; text-align:center; }
.hR { width:34%; direction:rtl; text-align:right; }
.cname-en { font-weight:800; font-size:12.5pt; color:#30246C; line-height:1.05; }
.tag-en { font-weight:700; font-size:6.4pt; color:#30246C; margin-top:1mm; }
.cap-en { font-size:7.2pt; color:#30246C; margin-top:.3mm; }
.cname-ar { font-weight:800; font-size:15pt; color:#30246C; line-height:1; }
.tag-ar { font-weight:700; font-size:7pt; color:#30246C; margin-top:1mm; }
.cap-ar { font-size:7.5pt; color:#30246C; margin-top:.3mm; }
.contact { font-size:7.4pt; color:#30246C; margin-top:1.5mm; line-height:1.55; }
.contact span { font-weight:800; }
.logo { width:26mm; }
.title { text-align:center; margin-top:0.5mm; margin-bottom:1mm; }
.title .a { font-weight:800; font-size:13pt; color:#30246C; }
.title .b { font-weight:800; font-size:11pt; color:#30246C; letter-spacing:.3px; }
.meta { direction:rtl; display:flex; flex-direction:column; font-size:9.5pt; color:#30246C; font-weight:700; margin:1mm 1mm 1.5mm 1mm; }
.m-date { margin-bottom:1.8mm; }
.m-to { display:flex; align-items:flex-end; }
.dotline { flex:1; border-bottom:1px dotted #30246C; margin:0 2mm; transform:translateY(-3px); }
table { width:100%; border-collapse:collapse; direction:ltr; }
th,td { border:1px solid #30246C; text-align:center; vertical-align:middle; }
thead th { color:#30246C; font-weight:800; padding:1mm; }
.grp { font-size:9.5pt; } .sub { font-size:8pt; font-weight:700; }
.c-desc { width:38%; } .c-qty { width:13%; } .c-d { width:13%; } .c-f { width:6.5%; }
tbody td { height:8mm; }
.deschead { font-size:10pt; } .descsub { font-size:8.5pt; }
.totrow td { color:#30246C; font-weight:800; padding:1.6mm 2mm; font-size:10pt; }
.tot-label { text-align:center; }
.foot { direction:rtl; display:flex; justify-content:space-between; font-size:10pt; color:#30246C; font-weight:700; margin-top:4mm; }
.foot .ln { display:inline-block; width:46mm; border-bottom:1px dotted #30246C; margin:0 2mm; transform:translateY(-3px); }
.wm { position:absolute; top:46%; left:50%; transform:translate(-50%,-50%); width:70mm; opacity:.06; }

      `}</style>
      <style>{`.hdr{visibility:hidden!important;}.wm{display:none!important;}`}</style>
      <div className="page"><img className="wm" src="" />
<div className="p">
  <div className="hdr">
    <div className="hL en">
      <div className="cname-en">Al Manar Al Duwaliya Company <span style={{"fontSize": "7pt"}}>L.L.C</span></div>
      <div className="tag-en">For construction and maintenance of roads streets pavements and road supplies</div>
      <div className="cap-en">Paid-up capital: 500,000 thousand K.D.</div>
      <div className="contact">
        <span>&#9742;</span> : 99333820 / 94404401<br />
        <span>&#9743;</span> : 98777887<br />
        <span>&#9993;</span> : Manar.int.co@gmail.com
      </div>
    </div>
    <div className="hC"><img className="logo" src="" /></div>
    <div className="hR ar">
      <div className="cname-ar">شركة المنار الدولية <span style={{"fontSize": "9pt"}}>ذ.م.م</span></div>
      <div className="tag-ar">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div className="cap-ar">رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
      <div className="contact">
        99333820 / 94404401 : <span>&#9742;</span><br />
        98777887 : <span>&#9743;</span><br />
        Manar.int.co@gmail.com : <span>&#9993;</span>
      </div>
    </div>
  </div>
  <div className="title"><div className="a">فاتورة نقداً / بالحساب</div><div className="b">Cash / Credit Invoice</div></div>
  <div className="meta">
    <div className="m-date">التاريخ : &nbsp;&nbsp;/&nbsp;&nbsp;/&nbsp; 20&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
    <div className="m-to"><span>المطلوب من السيد / السادة :</span><span className="dotline"></span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th className="c-desc" rowSpan={2}><div className="deschead">ملاحظات</div><div className="descsub">Description</div></th>
        <th className="c-qty" rowSpan={2}><div className="grp">الكمية</div><div className="sub">طن / درب</div></th>
        <th colSpan={2}><div className="grp">سعر الوحدة</div><div className="sub">Unit Price</div></th>
        <th colSpan={2}><div className="grp">القيمة</div><div className="sub">Total Price</div></th>
      </tr>
      <tr>
        <th className="sub">دينار K.D</th><th className="sub">فلس Fils</th>
        <th className="sub">دينار K.D</th><th className="sub">فلس Fils</th>
      </tr>
    </thead>
    <tbody><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr><tr><td className="c-desc"></td><td className="c-qty"></td><td className="c-d"></td><td className="c-f"></td><td className="c-d"></td><td className="c-f"></td></tr></tbody>
    <tfoot>
      <tr className="totrow"><td colSpan={6}><div style={{"display": "flex", "justifyContent": "space-between", "direction": "rtl", "alignItems": "center"}}><span>القيمة الإجمالية مبلغ وقدره ...........................................................................</span><span style={{"direction": "ltr"}}>Total :</span></div></td></tr>
    </tfoot>
  </table>
  <div className="foot">
    <div>المحاسبة : <span className="ln"></span></div>
    <div>المسؤول : <span className="ln"></span></div>
  </div>
</div></div>
    </>
  );
}