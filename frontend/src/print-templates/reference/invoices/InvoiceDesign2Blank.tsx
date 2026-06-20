export default function InvoiceDesign2Blank() {
  return (
    <>
      <style>{`
body { margin:0; font-family:'Cairo', sans-serif; color:#000; }
.page { width:210mm; height:297mm; position:relative; background:#fff; overflow:hidden; }
.ar { direction:rtl; text-align:right; }
.en { direction:ltr; text-align:left; }

.page { display:block; }
.bar { height:5mm; background:#30246C; }
.head { width:100%; padding:7mm 12mm 4mm 12mm; display:flex; justify-content:space-between; align-items:center; }
.brand { width:60%; display:flex; align-items:center; }
.brand img { width:17mm; margin-left:5mm; }
.txt { direction:rtl; }
.cn-ar { font-weight:800; font-size:15pt; color:#30246C; line-height:1.1; white-space:nowrap; }
.cn-sub { font-size:7.6pt; color:#000; margin-top:.8mm; white-space:nowrap; }
.cn-en { font-weight:800; font-size:8pt; color:#30246C; margin-top:.8mm; letter-spacing:.2px; }
.invtitle { width:38%; text-align:left; }
.invtitle .h { font-weight:800; font-size:24pt; color:#30246C; letter-spacing:1.5px; line-height:1; }
.invtitle .ar { font-weight:700; font-size:11pt; color:#000; }
.metawrap { width:100%; padding:0 12mm; display:flex; }
.mbox { flex:1; border-top:2px solid #30246C; padding:3mm 0 0 0; margin-left:6mm; direction:rtl; }
.mbox:last-child { margin-left:0; }
.mrow { display:flex; font-size:9.3pt; margin-bottom:1.5mm; }
.mrow b { color:#30246C; font-weight:800; width:30mm; }
.mrow span { color:#000; }
table { width:100%; margin-top:6mm; border-collapse:collapse; direction:rtl; }
table .pad { }
thead th { background:#30246C; color:#fff; font-weight:700; font-size:9pt; padding:2.6mm 2mm; text-align:center; }
tbody td { border-bottom:1px solid #cdccdf; padding:2.8mm 2mm; font-size:9.5pt; text-align:center; color:#000; }
tbody td.ds { text-align:right; padding-right:4mm; }
tbody tr:nth-child(even) td { background:#f5f4fb; }
.n { width:7%; } .ds { width:43%; } .u { width:11%; } .q { width:11%; } .pr { width:14%; } .t { width:14%; font-weight:800; color:#30246C; }
.tedge { padding-left:12mm; padding-right:12mm; }
.words { direction:rtl; margin:5mm 12mm 0 12mm; font-size:9pt; color:#000; background:#f5f4fb; border-right:3px solid #30246C; padding:2.5mm 3mm; }
.words b { color:#30246C; }
.bottom { width:100%; display:flex; justify-content:space-between; padding:5mm 12mm 0 12mm; direction:rtl; }
.left { width:53%; } .right { width:42%; }
.sec-h { font-weight:800; color:#30246C; font-size:9.5pt; margin-bottom:1.5mm; border-bottom:1px solid #30246C; padding-bottom:1mm; }
.sec-b { font-size:8.8pt; line-height:1.7; color:#000; }
.tr { display:flex; justify-content:space-between; font-size:10pt; padding:2mm 1mm; border-bottom:1px solid #d8d7e6; }
.tr b { font-weight:700; color:#000; }
.grand { background:#30246C; color:#fff; padding:3mm; font-size:12pt; font-weight:800; display:flex; justify-content:space-between; margin-top:1.5mm; }
.sign { width:100%; display:flex; justify-content:space-between; direction:rtl; padding:0 12mm; margin-top:14mm; }
.s { text-align:center; width:30%; }
.lbl { font-size:9pt; font-weight:800; color:#30246C; margin-bottom:12mm; }
.ln { border-top:1px solid #000; padding-top:1mm; font-size:8pt; color:#000; }
.footbar { height:4mm; background:#30246C; position:absolute; bottom:0; left:0; right:0; }
.contactbar { position:absolute; bottom:4mm; left:0; right:0; text-align:center; direction:rtl; font-size:7.6pt; color:#30246C; padding:2mm; }

      `}</style>
      <style>{`.brand{visibility:hidden!important;}.footbar{visibility:hidden!important;}.wm{display:none!important;}`}</style>
      <div className="page">
  <div className="bar"></div>
  <div className="head">
    <div className="brand"><img src="" />
      <div className="txt"><div className="cn-ar">شركة المنار الدولية</div>
        <div className="cn-sub">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
        <div className="cn-en">AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    </div>
    <div className="invtitle"><div className="h">INVOICE</div><div className="ar">فاتورة نقداً / بالحساب</div></div>
  </div>
  <div className="metawrap">
    <div className="mbox">
      <div className="mrow"><b>رقم الفاتورة</b><span>INV-2026-0142</span></div>
      <div className="mrow"><b>التاريخ</b><span>20 / 06 / 2026</span></div>
    </div>
    <div className="mbox">
      <div className="mrow"><b>العميل / السادة</b><span>مصنع الخليج للأسفلت ذ.م.م</span></div>
      <div className="mrow"><b>المشروع</b><span>توريد ونقل أسفلت – عقد شهري</span></div>
      <div className="mrow"><b>موقع المشروع</b><span>منطقة الشعيبة الصناعية – الكويت</span></div>
    </div>
  </div>
  <div className="tedge">
  <table>
    <thead><tr><th className="n">م</th><th>البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody><tr><td className="n">1</td><td className="ds">نقل أسفلت – خلطة ساخنة</td><td className="u">درب</td><td className="q">12</td><td className="pr">28.500</td><td className="t">342.000</td></tr><tr><td className="n">2</td><td className="ds">توريد ونقل بيس كورس</td><td className="u">طن</td><td className="q">60</td><td className="pr">4.250</td><td className="t">255.000</td></tr><tr><td className="n">3</td><td className="ds">أجور معدة فرش وتسوية</td><td className="u">يوم</td><td className="q">3</td><td className="pr">45.000</td><td className="t">135.000</td></tr></tbody>
  </table>
  </div>
  <div className="words"><b>المبلغ كتابةً: </b>سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير</div>
  <div className="bottom">
    <div className="left">
      <div className="sec-h">شروط الدفع</div><div className="sec-b">السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
    </div>
    <div className="right">
      <div className="tr"><b>المجموع الفرعي</b><span>732.000 د.ك</span></div>
      <div className="grand"><span>الإجمالي النهائي</span><span>732.000 د.ك</span></div>
    </div>
  </div>
  <div className="sign">
    <div className="s"><div className="lbl">المحاسبة</div><div className="ln">التوقيع</div></div>
    <div className="s"><div className="lbl">الختم</div><div className="ln">&nbsp;</div></div>
    <div className="s"><div className="lbl">المسؤول / المعتمد</div><div className="ln">التوقيع</div></div>
  </div>
  <div className="contactbar">99333820 / 94404401 &nbsp;|&nbsp; واتساب 98777887 &nbsp;|&nbsp; Manar.int.co@gmail.com</div>
  <div className="footbar"></div>
</div>
    </>
  );
}