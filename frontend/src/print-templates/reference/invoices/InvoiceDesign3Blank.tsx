export default function InvoiceDesign3Blank() {
  return (
    <>
      <style>{`
body { margin:0; font-family:'Cairo', sans-serif; color:#000; }
.page { width:210mm; height:297mm; position:relative; background:#fff; overflow:hidden; }
.ar { direction:rtl; text-align:right; }
.en { direction:ltr; text-align:left; }

.page { padding:10mm 11mm; }
.head { width:100%; display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:4mm; border-bottom:3px solid #30246C; }
.brand { width:62%; display:flex; align-items:center; }
.brand img { width:18mm; margin-left:5mm; }
.cn-ar { font-weight:800; font-size:16pt; color:#30246C; line-height:1.1; white-space:nowrap; direction:rtl; }
.cn-sub { font-size:7.8pt; color:#000; margin-top:1mm; white-space:nowrap; direction:rtl; }
.cn-en { font-weight:800; font-size:8pt; color:#30246C; margin-top:1mm; }
.metabox { width:34%; border:1.5px solid #30246C; direction:rtl; }
.metabox .h { background:#30246C; color:#fff; font-weight:800; font-size:11pt; text-align:center; padding:1.6mm; letter-spacing:1px; }
.metabox .r { display:flex; justify-content:space-between; padding:1.8mm 2.5mm; font-size:9pt; border-bottom:1px solid #d5d4e4; }
.metabox .r:last-child { border-bottom:none; }
.metabox .r b { color:#30246C; font-weight:800; }
.boxes { width:100%; display:flex; margin-top:5mm; }
.box { flex:1; border:1.2px solid #30246C; direction:rtl; margin-left:5mm; }
.box:last-child { margin-left:0; }
.box .bh { background:#eeedf6; color:#30246C; font-weight:800; font-size:9.5pt; padding:1.8mm 3mm; border-bottom:1.2px solid #30246C; }
.box .bb { padding:2.6mm 3mm; font-size:9.3pt; line-height:1.85; color:#000; }
.box .bb b { color:#30246C; font-weight:700; }
table { width:100%; margin-top:5mm; border-collapse:collapse; direction:rtl; }
thead th { background:#30246C; color:#fff; font-weight:700; font-size:9pt; padding:2.6mm 2mm; text-align:center; border:1px solid #30246C; }
tbody td { border:1px solid #b9b8cf; padding:2.7mm 2mm; font-size:9.5pt; text-align:center; color:#000; }
tbody td.ds { text-align:right; padding-right:4mm; }
.n { width:7%; } .ds { width:43%; } .t { font-weight:800; color:#30246C; }
.bottom { width:100%; display:flex; justify-content:space-between; margin-top:5mm; direction:rtl; }
.tl { width:54%; } .tr2 { width:42%; border:1.2px solid #30246C; }
.tr2 .row { display:flex; justify-content:space-between; padding:2.3mm 3mm; font-size:10pt; border-bottom:1px solid #d5d4e4; }
.tr2 .row b { color:#000; }
.tr2 .grand { background:#30246C; color:#fff; font-weight:800; font-size:12pt; padding:3mm; display:flex; justify-content:space-between; }
.sec { border:1.2px solid #30246C; direction:rtl; }
.sec .sh { background:#eeedf6; color:#30246C; font-weight:800; font-size:9pt; padding:1.6mm 3mm; }
.sec .sb { padding:2.4mm 3mm; font-size:8.7pt; line-height:1.7; color:#000; }
.words { direction:rtl; margin-top:5mm; border:1.2px solid #30246C; padding:2.5mm 3mm; font-size:9pt; }
.words b { color:#30246C; }
.sign { width:100%; display:flex; justify-content:space-between; direction:rtl; margin-top:14mm; }
.s { width:30%; text-align:center; }
.s .lbl { font-weight:800; color:#30246C; font-size:9.5pt; margin-bottom:13mm; }
.s .ln { border-top:1.4px solid #30246C; padding-top:1mm; font-size:8pt; }
.fbar { width:100%; border-top:3px solid #30246C; margin-top:6mm; padding-top:2mm; text-align:center; direction:rtl; font-size:8pt; color:#30246C; }

      `}</style>
      <style>{`.brand{visibility:hidden!important;}.wm{display:none!important;}`}</style>
      <div className="page">
  <div className="head">
    <div className="brand"><img src="" />
      <div><div className="cn-ar">شركة المنار الدولية ذ.م.م</div>
        <div className="cn-sub">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
        <div className="cn-en">AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    </div>
    <div className="metabox"><div className="h">فاتورة INVOICE</div>
      <div className="r"><b>رقم الفاتورة</b><span>INV-2026-0142</span></div>
      <div className="r"><b>التاريخ</b><span>20 / 06 / 2026</span></div>
      <div className="r"><b>النوع</b><span>نقداً / بالحساب</span></div>
    </div>
  </div>
  <div className="boxes">
    <div className="box"><div className="bh">بيانات العميل</div>
      <div className="bb"><b>الاسم:</b> مصنع الخليج للأسفلت ذ.م.م<br /><b>المسمى:</b> Gulf Asphalt Factory</div></div>
    <div className="box"><div className="bh">بيانات المشروع</div>
      <div className="bb"><b>المشروع:</b> توريد ونقل أسفلت – عقد شهري<br /><b>الموقع:</b> منطقة الشعيبة الصناعية – الكويت</div></div>
  </div>
  <table>
    <thead><tr><th className="n">م</th><th>البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody><tr><td className="n">1</td><td className="ds">نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className="t">342.000</td></tr><tr><td className="n">2</td><td className="ds">توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className="t">255.000</td></tr><tr><td className="n">3</td><td className="ds">أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className="t">135.000</td></tr></tbody>
  </table>
  <div className="words"><b>المبلغ كتابةً: </b>سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير</div>
  <div className="bottom">
    <div className="tl">
      <div className="sec"><div className="sh">شروط الدفع</div><div className="sb">السداد خلال 30 يوماً من تاريخ الفاتورة.</div></div>
      <div className="sec" style={{"marginTop": "4mm"}}><div className="sh">ملاحظات</div><div className="sb" style={{"minHeight": "16mm"}}></div></div>
    </div>
    <div className="tr2">
      <div className="row"><b>المجموع الفرعي</b><span>732.000 د.ك</span></div>
      <div className="grand"><span>الإجمالي النهائي</span><span>732.000 د.ك</span></div>
    </div>
  </div>
  <div className="sign">
    <div className="s"><div className="lbl">المحاسبة</div><div className="ln">التوقيع</div></div>
    <div className="s"><div className="lbl">الختم الرسمي</div><div className="ln">&nbsp;</div></div>
    <div className="s"><div className="lbl">المسؤول / المعتمد</div><div className="ln">التوقيع</div></div>
  </div>
  <div className="fbar">هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
</div>
    </>
  );
}