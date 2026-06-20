export default function InvoiceDesign4Blank() {
  return (
    <>
      <style>{`
body { margin:0; font-family:'Cairo', sans-serif; color:#000; }
.page { width:210mm; height:297mm; position:relative; background:#fff; overflow:hidden; }
.ar { direction:rtl; text-align:right; }
.en { direction:ltr; text-align:left; }

.page { padding:9mm 10mm; display:flex; flex-direction:column; }
.strip { width:100%; border:1.5px solid #30246C; display:flex; direction:rtl; }
.s-logo { width:24mm; border-left:1.5px solid #30246C; display:flex; align-items:center; justify-content:center; padding:2mm; }
.s-logo img { width:16mm; }
.s-name { flex:1; padding:2.5mm 4mm; direction:rtl; }
.s-name .a { font-weight:800; font-size:14.5pt; color:#30246C; line-height:1.1; }
.s-name .b { font-size:7.6pt; color:#000; margin-top:.6mm; }
.s-name .c { font-weight:700; font-size:7.4pt; color:#30246C; margin-top:.6mm; }
.s-meta { width:50mm; border-right:1.5px solid #30246C; direction:rtl; }
.s-meta .mh { background:#30246C; color:#fff; text-align:center; font-weight:800; font-size:9.5pt; padding:1.3mm; letter-spacing:1px; }
.s-meta .mr { display:flex; justify-content:space-between; padding:1.4mm 2.5mm; font-size:8.4pt; border-bottom:1px solid #cfcee0; }
.s-meta .mr:last-child { border-bottom:none; }
.s-meta .mr b { color:#30246C; font-weight:800; }
.clientrow { width:100%; border:1.5px solid #30246C; border-top:none; display:flex; direction:rtl; }
.clientrow .cell { flex:1; padding:1.8mm 4mm; font-size:8.8pt; direction:rtl; border-left:1px solid #cfcee0; }
.clientrow .cell:last-child { border-left:none; }
.clientrow .cell b { color:#30246C; font-weight:800; }
table { width:100%; border-collapse:collapse; direction:rtl; margin-top:4mm; }
thead th { background:#30246C; color:#fff; font-weight:700; font-size:9pt; padding:2.4mm 1mm; text-align:center; border:1px solid #30246C; }
tbody td { border:1px solid #9d9cba; padding:2.5mm 2mm; font-size:9.3pt; text-align:center; height:7mm; color:#000; }
tbody td.ds { text-align:right; padding-right:3.5mm; }
tbody .empty td { height:7mm; }
.n { width:6%; } .ds { width:44%; } .t { font-weight:800; color:#30246C; }
tfoot td { border:1px solid #30246C; font-weight:700; font-size:9.5pt; padding:2.2mm 2mm; }
tfoot .lab { text-align:right; padding-right:3.5mm; color:#30246C; font-weight:800; background:#eeedf6; }
tfoot .val { text-align:center; }
tfoot .grand td { background:#30246C; color:#fff; font-size:11pt; font-weight:800; }
.words { width:100%; direction:rtl; border:1.5px solid #30246C; border-top:none; padding:2.2mm 3mm; font-size:9pt; }
.words b { color:#30246C; }
.bottom { width:100%; display:flex; direction:rtl; margin-top:5mm; }
.terms { flex:1; border:1.2px solid #30246C; margin-left:5mm; direction:rtl; }
.terms .h { background:#eeedf6; color:#30246C; font-weight:800; font-size:9pt; padding:1.6mm 3mm; border-bottom:1.2px solid #30246C; }
.terms .b { padding:2.4mm 3mm; font-size:8.6pt; line-height:1.7; }
.sign { width:55mm; }
.sbox { border:1.2px solid #30246C; text-align:center; margin-bottom:4mm; }
.sbox .h { background:#eeedf6; color:#30246C; font-weight:800; font-size:8.6pt; padding:1.4mm; border-bottom:1.2px solid #30246C; }
.sbox .b { height:15mm; }
.fbar { width:100%; margin-top:auto; border-top:2px solid #30246C; padding-top:2mm; text-align:center; direction:rtl; font-size:8pt; color:#30246C; }

      `}</style>
      <style>{`.head{visibility:hidden!important;}.wm{display:none!important;}`}</style>
      <div className="page">
  <div className="strip">
    <div className="s-logo"><img src="" /></div>
    <div className="s-name"><div className="a">شركة المنار الدولية ذ.م.م</div>
      <div className="b">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق — رأس المال ٥٠٠،٠٠٠ د.ك</div>
      <div className="c">AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    <div className="s-meta"><div className="mh">فاتورة / INVOICE</div>
      <div className="mr"><b>رقم</b><span>INV-2026-0142</span></div>
      <div className="mr"><b>التاريخ</b><span>20 / 06 / 2026</span></div>
    </div>
  </div>
  <div className="clientrow">
    <div className="cell"><b>العميل:</b> مصنع الخليج للأسفلت ذ.م.م</div>
    <div className="cell"><b>المشروع:</b> توريد ونقل أسفلت – عقد شهري</div>
    <div className="cell"><b>الموقع:</b> منطقة الشعيبة الصناعية – الكويت</div>
  </div>
  <table>
    <thead><tr><th className="n">م</th><th>البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody><tr><td className="n">1</td><td className="ds">نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className="t">342.000</td></tr><tr><td className="n">2</td><td className="ds">توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className="t">255.000</td></tr><tr><td className="n">3</td><td className="ds">أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className="t">135.000</td></tr><tr className="empty"><td className="n">&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr><tr className="empty"><td className="n">&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr><tr className="empty"><td className="n">&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr><tr className="empty"><td className="n">&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr><tr className="empty"><td className="n">&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr><tr className="empty"><td className="n">&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr></tbody>
    <tfoot>
      <tr><td className="lab" colSpan={5}>المجموع الفرعي</td><td className="val">732.000</td></tr>
      <tr className="grand"><td colSpan={5} style={{"textAlign": "right", "paddingRight": "3.5mm"}}>الإجمالي النهائي (د.ك)</td><td className="val">732.000</td></tr>
    </tfoot>
  </table>
  <div className="words"><b>المبلغ كتابةً: </b>سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير</div>
  <div className="bottom">
    <div className="terms">
      <div className="h">شروط الدفع</div>
      <div className="b">السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
      <div className="h" style={{"marginTop": "4mm"}}>ملاحظات</div>
      <div className="b" style={{"minHeight": "16mm"}}></div>
    </div>
    <div className="sign">
      <div className="sbox"><div className="h">المحاسبة</div><div className="b"></div></div>
      <div className="sbox"><div className="h">المسؤول / الختم</div><div className="b"></div></div>
    </div>
  </div>
  <div className="fbar">هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
</div>
    </>
  );
}