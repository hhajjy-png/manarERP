export default function InvoiceDesign5() {
  return (
    <>
      <style>{`
body { margin:0; font-family:'Cairo', sans-serif; color:#000; }
.page { width:210mm; height:297mm; position:relative; background:#fff; overflow:hidden; }
.ar { direction:rtl; text-align:right; }
.en { direction:ltr; text-align:left; }

.page { padding:9mm 11mm; }
.hdr { width:100%; display:flex; justify-content:space-between; align-items:flex-start; }
.hL { width:33%; } .hC { width:30%; text-align:center; } .hR { width:33%; direction:rtl; text-align:right; }
.en-n { font-weight:800; font-size:11pt; color:#30246C; line-height:1.05; }
.en-t { font-size:6.6pt; color:#000; font-weight:600; margin-top:1mm; }
.en-c { font-size:7pt; color:#30246C; margin-top:2.5mm; line-height:1.7; }
.ar-n { font-weight:800; font-size:14pt; color:#30246C; line-height:1.05; }
.ar-t { font-size:7pt; color:#000; font-weight:600; margin-top:1mm; }
.ar-c { font-size:7.4pt; color:#30246C; margin-top:2.5mm; line-height:1.7; }
.logo { width:22mm; }
.title { margin-top:1.5mm; }
.title .a { font-weight:800; font-size:12pt; color:#30246C; }
.title .b { font-weight:800; font-size:10pt; color:#30246C; }
.rule { width:100%; border-top:2px solid #30246C; margin:3mm 0; }
.meta { width:100%; display:flex; direction:rtl; border:1.2px solid #30246C; }
.meta .c { flex:1; padding:1.8mm 3mm; font-size:9pt; border-left:1px solid #cfcee0; direction:rtl; }
.meta .c:last-child { border-left:none; }
.meta .c b { color:#30246C; font-weight:800; }
.meta .full { flex:2; }
table { width:100%; border-collapse:collapse; direction:rtl; margin-top:4mm; }
thead th { border:1.2px solid #30246C; color:#30246C; font-weight:800; font-size:9.5pt; padding:2.4mm 1mm; text-align:center; background:#f2f1f9; }
tbody td { border:1px solid #30246C; padding:2.6mm 2mm; font-size:9.5pt; text-align:center; height:7.6mm; color:#000; }
tbody td.ds { text-align:right; padding-right:4mm; }
tbody .e td { height:7.6mm; }
.ds { width:46%; } .t { font-weight:800; color:#30246C; }
.belt { width:100%; display:flex; direction:rtl; margin-top:4mm; }
.words { flex:1; border:1.2px solid #30246C; padding:2.6mm 3mm; font-size:9pt; margin-left:5mm; direction:rtl; }
.words b { color:#30246C; }
.tot { width:62mm; border:1.2px solid #30246C; direction:rtl; }
.tot .r { display:flex; justify-content:space-between; padding:1.8mm 3mm; font-size:9.5pt; border-bottom:1px solid #cfcee0; }
.tot .r b { color:#000; font-weight:700; }
.tot .g { background:#30246C; color:#fff; font-weight:800; font-size:11pt; padding:2.6mm 3mm; display:flex; justify-content:space-between; }
.secrow { width:100%; display:flex; direction:rtl; margin-top:5mm; }
.sec { flex:1; direction:rtl; margin-left:5mm; }
.sec:last-child { margin-left:0; }
.sec .h { font-weight:800; color:#30246C; font-size:9.5pt; border-bottom:1.5px solid #30246C; padding-bottom:1mm; margin-bottom:1.5mm; }
.sec .b { font-size:8.8pt; line-height:1.75; color:#000; }
.sign { width:100%; display:flex; justify-content:space-between; direction:rtl; margin-top:16mm; }
.s { width:30%; text-align:center; }
.s .lbl { font-weight:800; color:#30246C; font-size:10pt; margin-bottom:13mm; }
.s .ln { border-top:1.4px solid #30246C; padding-top:1mm; font-size:8pt; color:#000; }

      `}</style>
      <div className="page">
  <div className="hdr">
    <div className="hL"><div className="en-n">Al Manar Al Duwaliya Co. <span style={{"fontSize": "7pt"}}>L.L.C</span></div>
      <div className="en-t">For construction &amp; maintenance of roads, streets, pavements and road supplies</div>
      <div className="en-c">Tel: 99333820 / 94404401<br />WhatsApp: 98777887<br />Manar.int.co@gmail.com</div></div>
    <div className="hC"><img className="logo" src="" />
      <div className="title"><div className="a">فاتورة نقداً / بالحساب</div><div className="b">Cash / Credit Invoice</div></div></div>
    <div className="hR"><div className="ar-n">شركة المنار الدولية ذ.م.م</div>
      <div className="ar-t">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div className="ar-c">هاتف: 99333820 / 94404401<br />واتساب: 98777887<br />رأس المال المدفوع ٥٠٠،٠٠٠ د.ك</div></div>
  </div>
  <div className="rule"></div>
  <div className="meta">
    <div className="c"><b>رقم الفاتورة:</b> INV-2026-0142</div>
    <div className="c"><b>التاريخ:</b> 20 / 06 / 2026</div>
    <div className="c full"><b>المطلوب من السادة:</b> مصنع الخليج للأسفلت ذ.م.م</div>
  </div>
  <div className="meta" style={{"borderTop": "none"}}>
    <div className="c full"><b>المشروع:</b> توريد ونقل أسفلت – عقد شهري</div>
    <div className="c full"><b>موقع المشروع:</b> منطقة الشعيبة الصناعية – الكويت</div>
  </div>
  <table>
    <thead><tr><th className="ds">البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody><tr><td className="ds">نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className="t">342.000</td></tr><tr><td className="ds">توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className="t">255.000</td></tr><tr><td className="ds">أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className="t">135.000</td></tr><tr className="e"><td></td><td></td><td></td><td></td><td></td></tr><tr className="e"><td></td><td></td><td></td><td></td><td></td></tr><tr className="e"><td></td><td></td><td></td><td></td><td></td></tr><tr className="e"><td></td><td></td><td></td><td></td><td></td></tr><tr className="e"><td></td><td></td><td></td><td></td><td></td></tr></tbody>
  </table>
  <div className="belt">
    <div className="words"><b>المبلغ كتابةً:</b><br />سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير</div>
    <div className="tot">
      <div className="r"><b>المجموع الفرعي</b><span>732.000 د.ك</span></div>
      <div className="g"><span>الإجمالي النهائي</span><span>732.000 د.ك</span></div>
    </div>
  </div>
  <div className="secrow">
    <div className="sec"><div className="h">شروط الدفع</div><div className="b">السداد خلال 30 يوماً من تاريخ الفاتورة.</div></div>
    <div className="sec"><div className="h">ملاحظات</div><div className="b" style={{"minHeight": "16mm"}}></div></div>
  </div>
  <div className="sign">
    <div className="s"><div className="lbl">المحاسبة</div><div className="ln">التوقيع</div></div>
    <div className="s"><div className="lbl">الختم الرسمي</div><div className="ln">&nbsp;</div></div>
    <div className="s"><div className="lbl">المسؤول</div><div className="ln">التوقيع</div></div>
  </div>
</div>
    </>
  );
}