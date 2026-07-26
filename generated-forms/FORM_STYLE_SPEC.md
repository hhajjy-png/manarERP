# مواصفات تصميم نماذج المنار (المرجع الثابت)

> **الغرض:** هذا الملف هو المصدر الرسمي لتنسيق نماذج المنار المطبوعة.
> عندما تريد نموذجاً جديداً، قل ببساطة:
> **«استخدم تنسيق نماذج المنار السابق واصنع لي نموذج ‹اسم النموذج›»**
> وسأقرأ هذا الملف وألتزم بكل ما فيه.
>
> آخر تحديث: 2026-07-05

---

## 0) كلمة السر (Trigger)

أي جملة من هذه تكفي لتفعيل هذا التنسيق:
- «استخدم التنسيق السابق للنماذج»
- «اصنع نموذج جديد بنفس تنسيق المنار»
- «نموذج على نفس ستايل سند القبض / محضر العهدة»

عند رؤيتها: اقرأ هذا الملف + راجع أقرب ملف HTML موجود في `generated-forms/` كمرجع حيّ، ثم ابنِ النموذج الجديد.

---

## 1) هوية الشركة (ثابتة في كل نموذج)

| العنصر | القيمة |
|--------|--------|
| الاسم (عربي) | شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م |
| الاسم (إنجليزي) | Al Manar Al Duwaliya Company — W.L.L |
| النشاط (EN) | For construction & maintenance of roads, streets, pavements and road supplies |
| رأس المال | رأس المال المدفوع 500,000 — Paid-up capital 500,000 K.D. |
| ص.ب | ص.ب: 29241 الصفاة • الرمز البريدي 13142 الكويت — P.O Box 29241, Code No. 13142 Kuwait |
| الهواتف | 94404401 / 99333820 |
| الإيميل | manar.int.co@gmail.com |
| الفوتر (عربي) | جليب الشيوخ — مجمع الروضة التجاري — الدور الثاني — مكتب 13 |
| الفوتر (EN) | Jleeb Al Shuyoukh — Al Rawda Commercial Complex — Second Floor — Office 13 |
| الشعار | علامة اللهب مقصوصة من `logo.png` (تُستخدم أيضاً كعلامة مائية باهتة) |

---

## 2) الألوان والخطوط

```
--blue : #2b2e83   /* الأزرق المؤسسي: العناوين، الترويسة، الجداول، التوقيعات */
--foot : #8d4a3a   /* العنابي: الفوتر فقط */
```

- **الخط العربي:** Cairo (مضمّن base64 woff2، أوزان 400/600/700).
- **الخط اللاتيني:** Times New Roman (بدائل: Liberation Serif / DejaVu Serif). يُطبّق على كل `<small>` والأعمدة الإنجليزية.
- خلفية الشاشة رمادية `#5557`، والورقة بيضاء.

**أحجام الخط (pt):**
| العنصر | الحجم |
|--------|-------|
| عنوان النموذج (title) | 18pt |
| العنوان الفرعي الإنجليزي (letterspacing 4px) | 10pt |
| اسم الشركة في الترويسة | 13pt |
| نص الحقول / الميتا | 11pt |
| عناوين خلايا الجدول (lbl) | 13pt |
| نص الجداول | 9–11pt |
| المبلغ (amount) | 14pt |
| التوقيعات | 12pt |
| النصوص الإنجليزية الصغيرة | 7.5–8pt |

---

## 3) قياسات الصفحة

- **A4** (`210mm × 297mm`)، اتجاه **RTL**.
- كل ملف = **صفحتان للطباعة**:
  1. **النسخة الكاملة (sheet-full):** بادينج `44mm 17mm 24mm` — فيها الترويسة + الشعار + العلامة المائية + الفوتر.
  2. **نسخة الورق الرسمي (sheet-plain):** بادينج `45mm 18mm 25mm` — للطباعة على ورق مطبوع مسبقاً (المحتوى فقط: يبدأ ~4.5cm من الأعلى، ينتهي ~2.5cm من الأسفل).
- `@page{size:A4;margin:0}` وكل ورقة `page-break-after:always`.

---

## 4) الترويسة (Header) — قاعدة الخط الأزرق

```css
.lh-header{position:absolute; top:9mm; left:20mm; width:170mm;
  display:flex; align-items:center; gap:5mm; z-index:4;
  border-bottom:1.6px solid var(--blue);   /* ← الخط الأزرق */
  padding-bottom:1.5mm;}
```

- ثلاثة أعمدة: العربي يمين (`.ar` text-align:right) — الشعار وسط (`.lh-mark`, صورة ارتفاع 22mm) — الإنجليزي يسار (`.en` text-align:left; direction:ltr).
- **الخط الأزرق هو `border-bottom` للترويسة نفسها** — لذلك يقع دائماً أسفل الإيميل مباشرة مهما تغيّر عدد الأسطر. (لا تجعله عنصراً منفصلاً.)

**الفوتر:**
```css
.lh-footer{position:absolute; bottom:8mm; left:12mm; width:186mm;
  text-align:center; color:var(--foot);
  border-top:1px solid var(--foot); padding-top:4px; z-index:4;}
```

**العلامة المائية:**
```css
.watermark{position:absolute; top:74mm; left:47mm; width:115mm; opacity:.06; z-index:1;}
```

---

## 5) عنوان النموذج + عناصر متكررة

```css
.title{background:var(--blue); color:#fff; text-align:center; padding:8px;
  border-radius:7px; font-size:18pt; font-weight:700;}
.title small{display:block; font-size:10pt; font-weight:normal;
  letter-spacing:4px; opacity:.92; margin-top:2px;}   /* السطر الإنجليزي */
```

- **صناديق الميتا (رقم/تاريخ):** `border:1.5px solid var(--blue); border-radius:7px`، العناوين بالأزرق، الفراغ نقاط `border-bottom:1.3px dotted`.
- **الجداول:** `border-collapse; table-layout:fixed`؛ خلية العنوان `.lbl` خلفية `#eef0fb` نص أزرق؛ الحدود `1.2px solid #b9bccd`.
- **خانة الاختيار (checkbox):** مربع `13×13px` حد أزرق `1.5px` نصف قطر 3px.
- **صندوق المبلغ:** خلفية خضراء فاتحة `#f6faf6`، حد `#cdddcd`، نص أخضر `#1b5e20`، عملة «د.ك».
- **التوقيعات:** `border-top:1.5px solid #555`، العنوان أزرق 12pt، والوصف الإنجليزي رمادي 9pt.

> **تصغير الجداول 30%:** موجود داخل `@media print` (أحجام خط الجداول مخفّضة: عناوين 9pt، خلايا 7–8pt، ارتفاع الصف ~21px، الشيك 10px). حافظ عليه في أي نموذج جديد فيه جدول.

---

## 6) مخرجات كل نموذج (3 ملفات متزامنة دائماً)

لكل نموذج `<name>`:
1. **`<name>.html`** — ذاتي الاحتواء، صفحتان (full + plain).
2. **`<name>_full.png`** و **`<name>_plain.png`** — معاينتان (يُعاد رسمهما بعد أي تعديل HTML).
3. **`<name>.json`** — التعريف البنيوي (الحقول، الأعمدة، التوقيعات، جهات الاتصال، الخطوط).

**قاعدة الذهبية:** أي تعديل عام (ترويسة/هاتف/إيميل/فوتر/خط) يُطبّق على **كل** النماذج؛ وأي تعديل يمسّ بيانات بنيوية يُزامَن في JSON فوراً. لا تُحدّث HTML وتنسى PNG أو JSON.

---

## 7) خط أنابيب البناء (Linux sandbox — لا متصفح)

1. توليد HTML بـ Python.
2. **WeasyPrint:** `HTML(filename=...).write_pdf(...)`.
3. **PyMuPDF (fitz):** rasterize الصفحات إلى PNG بـ `dpi=150`.
4. خط Cairo: `npm pack @fontsource/cairo` ثم تضمين woff2 كـ base64.

**تحذيرات (Gotchas):**
- المجلد الموصول **يمنع unlink** → `PyMuPDF.save()` فوق PNG موجود يفشل. الحل: ارسم في `/tmp` ثم `cp` فوق الأصل (النسخ بالكتابة يعمل).
- WeasyPrint **يتجاهل** `transform` و`left+right` معاً على الصناديق المطلقة → استخدم `width`+`left` صريحة، أو التدفق الطبيعي مع padding.

---

## 8) النماذج السبعة الحالية (مرجع)

| الملف | النموذج |
|-------|---------|
| `sanad_qabd_design1/2` | سند قبض — Receipt Voucher |
| `sanad_sarf_design1/2` | سند صرف — Payment Voucher |
| `mahdar_taslim_ohda` | محضر تسليم عهدة — Custody Handover Record |
| `mahdar_istilam_ohda` | محضر استلام عهدة — Custody Return Record |
| `mahdar_istilam_mueda` | محضر استلام معدة — Equipment Receipt & Inspection |

انسخ أقرب نموذج مشابه كنقطة بداية (نفس البنية `.formA` للسندات، والجداول للمحاضر).
