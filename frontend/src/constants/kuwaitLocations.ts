export interface KuwaitLocation {
  name: string;
  aliases?: string[];
}

// ─── محافظة العاصمة ──────────────────────────────────────────────────────────
const CAPITAL: KuwaitLocation[] = [
  { name: 'شرق', aliases: ['Sharq'] },
  { name: 'القبلة', aliases: ['Qibla', 'Al Qibla'] },
  { name: 'المرقاب', aliases: ['Mirqab', 'Al Mirqab'] },
  { name: 'الدسمة', aliases: ['Dasman', 'Al Dasman'] },
  { name: 'الدعية', aliases: ['Daiya', 'Al Daiya'] },
  { name: 'بنيد القار', aliases: ['Bneid Al Gar'] },
  { name: 'الفيحاء', aliases: ['Faiha', 'Al Faiha'] },
  { name: 'الشامية', aliases: ['Shamiya', 'Al Shamiya'] },
  { name: 'الخالدية', aliases: ['Khaldiya', 'Al Khaldiya'] },
  { name: 'كيفان', aliases: ['Kaifan'] },
  { name: 'القادسية', aliases: ['Qadisiya', 'Al Qadisiya'] },
  { name: 'قرطبة', aliases: ['Qortuba', 'Qurtuba'] },
  { name: 'اليرموك', aliases: ['Yarmouk', 'Al Yarmouk'] },
  { name: 'الصليبخات', aliases: ['Shuwaikh', 'Sulaibikhat'] },
  { name: 'الدوحة', aliases: ['Doha', 'Al Doha'] },
  { name: 'غرناطة', aliases: ['Granada', 'Gharnata'] },
  { name: 'جابر الأحمد', aliases: ['Jaber Al Ahmad'] },
  { name: 'القيروان', aliases: ['Qairawān', 'Al Qayrawan'] },
  { name: 'النزهة', aliases: ['Nuzha', 'Al Nuzha'] },
  { name: 'الروضة', aliases: ['Rawda', 'Al Rawda'] },
  { name: 'إشبيلية', aliases: ['Ishbiliya', 'Essbiliya'] },
  { name: 'الرحاب', aliases: ['Rehab', 'Al Rehab'] },
  { name: 'اليوسفية', aliases: ['Yousifiya', 'Al Yousifiya'] },
  { name: 'صباح السالم', aliases: ['Sabah Al Salem'] },
  { name: 'المنصورية', aliases: ['Mansuriya', 'Al Mansuriya'] },
  { name: 'ضاحية عبدالله السالم', aliases: ['Abdullah Al Salem'] },
  { name: 'الزيتون', aliases: ['Zaytoon', 'Al Zaytoon'] },
  { name: 'نزهة', aliases: ['Nuzha District'] },
];

// ─── محافظة حولي ─────────────────────────────────────────────────────────────
const HAWALLI: KuwaitLocation[] = [
  { name: 'السالمية', aliases: ['Salmiya', 'Al Salmiya'] },
  { name: 'الرميثية', aliases: ['Rumaithiya', 'Al Rumaithiya'] },
  { name: 'الجابرية', aliases: ['Jabriya', 'Al Jabriya'] },
  { name: 'بيان', aliases: ['Bayan'] },
  { name: 'مشرف', aliases: ['Mishrif'] },
  { name: 'سلوى', aliases: ['Salwa'] },
  { name: 'الشعب', aliases: ['Shaab', 'Al Shaab'] },
  { name: 'البدع', aliases: ['Bida', 'Al Bidea'] },
  { name: 'السلام', aliases: ['Salam', 'Al Salam'] },
  { name: 'الزهراء', aliases: ['Zahra', 'Al Zahra'] },
  { name: 'الصديق', aliases: ['Siddeeq', 'Al Siddeeq'] },
  { name: 'حطين', aliases: ['Hutteen', 'Al Hutteen'] },
  { name: 'الشهداء', aliases: ['Shuhada', 'Al Shuhada'] },
  { name: 'حولي', aliases: ['Hawalli'] },
  { name: 'النقرة', aliases: ['Nuqra', 'Al Nuqra'] },
  { name: 'أنجفة', aliases: ['Anjafa'] },
  { name: 'طارق', aliases: ['Tariq'] },
  { name: 'السرة', aliases: ['Surra', 'Al Surra'] },
];

// ─── محافظة الفروانية ─────────────────────────────────────────────────────────
const FARWANIYA: KuwaitLocation[] = [
  { name: 'الفروانية', aliases: ['Farwaniya', 'Al Farwaniya'] },
  { name: 'خيطان', aliases: ['Khaitan'] },
  { name: 'العمرية', aliases: ['Umariya', 'Amriya'] },
  { name: 'الرابية', aliases: ['Rabiya', 'Al Rabiya'] },
  { name: 'الأندلس', aliases: ['Andalus', 'Al Andalus'] },
  { name: 'الفردوس', aliases: ['Firdous', 'Al Firdous'] },
  { name: 'العارضية', aliases: ['Ardhiya', 'Al Ardhiya'] },
  { name: 'عبدالله المبارك', aliases: ['Abdullah Al Mubarak'] },
  { name: 'غرب عبدالله المبارك', aliases: ['West Abdullah Al Mubarak'] },
  { name: 'جنوب عبدالله المبارك', aliases: ['South Abdullah Al Mubarak'] },
  { name: 'الضجيج', aliases: ['Dajeej', 'Al Dajeej'] },
  { name: 'الرقعي', aliases: ['Rego', 'Al Reqai'] },
  { name: 'أبو فطيرة', aliases: ['Abu Fteira'] },
  { name: 'الفنيطيس', aliases: ['Funaitees', 'Al Funaitees'] },
  { name: 'الريّان', aliases: ['Riyyan', 'Al Riyyan'] },
];

// ─── محافظة الأحمدي ──────────────────────────────────────────────────────────
const AHMADI: KuwaitLocation[] = [
  { name: 'صباح السالم', aliases: ['Sabah Al Salem'] },
  { name: 'العدان', aliases: ['Addan', 'Al Addan'] },
  { name: 'القصور', aliases: ['Qusor', 'Al Qusour'] },
  { name: 'القرين', aliases: ['Qurain', 'Al Qurain'] },
  { name: 'أبو فطيرة', aliases: ['Abu Fteira'] },
  { name: 'الفنيطيس', aliases: ['Funaitees', 'Al Funaitees'] },
  { name: 'المسايل', aliases: ['Masayel', 'Al Masayel'] },
  { name: 'المسيلة', aliases: ['Maseela', 'Al Maseela'] },
  { name: 'أبو الحصانية', aliases: ['Abu Al Hasaniya'] },
  { name: 'الفحيحيل', aliases: ['Fahaheel', 'Al Fahaheel'] },
  { name: 'المنقف', aliases: ['Mangaf', 'Al Mangaf'] },
  { name: 'أبو حليفة', aliases: ['Abu Halifa'] },
  { name: 'الفنطاس', aliases: ['Fintas', 'Al Fintas'] },
  { name: 'العقيلة', aliases: ['Aqila', 'Al Aqila'] },
  { name: 'المهبولة', aliases: ['Mahboula', 'Al Mahboula'] },
  { name: 'الرقة', aliases: ['Ruqa', 'Al Ruqa'] },
  { name: 'هدية', aliases: ['Hadiya'] },
  { name: 'الظهر', aliases: ['Daher', 'Al Daher'] },
  { name: 'الصباحية', aliases: ['Sabahiya', 'Al Sabahiya'] },
  { name: 'جابر العلي', aliases: ['Jaber Al Ali'] },
  { name: 'علي صباح السالم', aliases: ['Ali Sabah Al Salem'] },
  { name: 'الأحمدي', aliases: ['Ahmadi', 'Al Ahmadi'] },
  { name: 'الوفرة السكنية', aliases: ['Wafra Residential', 'Al Wafra'] },
  { name: 'جنوب صباح الأحمد', aliases: ['South Sabah Al Ahmad'] },
  { name: 'مدينة صباح الأحمد', aliases: ['Sabah Al Ahmad City'] },
  { name: 'صباح الأحمد البحرية', aliases: ['Sabah Al Ahmad Marine'] },
  { name: 'مدينة الخيران', aliases: ['Khairan City', 'Al Khairan'] },
];

// ─── محافظة الجهراء ──────────────────────────────────────────────────────────
const JAHRA: KuwaitLocation[] = [
  { name: 'الجهراء', aliases: ['Jahra', 'Al Jahra'] },
  { name: 'تيماء', aliases: ['Tayma', 'Al Tayma'] },
  { name: 'النعيم', aliases: ['Naeem', 'Al Naeem'] },
  { name: 'الواحة', aliases: ['Waha', 'Al Waha'] },
  { name: 'العيون', aliases: ['Uyun', 'Al Uyun'] },
  { name: 'القصر', aliases: ['Qasr', 'Al Qasr'] },
  { name: 'النسيم', aliases: ['Naseem', 'Al Naseem'] },
  { name: 'سعد العبدالله', aliases: ['Saad Al Abdullah', 'Saad Al Abdulla'] },
  { name: 'الصليبية', aliases: ['Sulaibiya', 'Al Sulaibiya'] },
  { name: 'كبد', aliases: ['Kabd'] },
  { name: 'العبدلي', aliases: ['Abdali', 'Al Abdali'] },
  { name: 'جنوب سعد العبدالله', aliases: ['South Saad Al Abdulla'] },
  { name: 'شرق سعد العبدالله', aliases: ['East Saad Al Abdulla'] },
  { name: 'غرب سعد العبدالله', aliases: ['West Saad Al Abdulla'] },
  { name: 'مدينة المطلاع', aliases: ['Mutlaa City', 'Al Mutlaa', 'المطلاع', 'Mutla'] },
  { name: 'مشروع المطلاع', aliases: ['Mutlaa Project', 'Al Mutlaa Project', 'Mutla Project'] },
];

// ─── محافظة مبارك الكبير ─────────────────────────────────────────────────────
const MUBARAK_ALKABEER: KuwaitLocation[] = [
  { name: 'مبارك الكبير', aliases: ['Mubarak Al Kabeer'] },
  { name: 'أبو الحصانية', aliases: ['Abu Al Hasaniya'] },
  { name: 'المسايل', aliases: ['Masayel', 'Al Masayel'] },
  { name: 'القرين', aliases: ['Qurain', 'Al Qurain'] },
  { name: 'الفنيطيس', aliases: ['Funaitees', 'Al Funaitees'] },
  { name: 'صباح السالم', aliases: ['Sabah Al Salem'] },
  { name: 'أبو فطيرة', aliases: ['Abu Fteira'] },
  { name: 'المسيلة', aliases: ['Maseela', 'Al Maseela'] },
];

// ─── مناطق جديدة ─────────────────────────────────────────────────────────────
const NEW_AREAS: KuwaitLocation[] = [
  { name: 'جنوب خيطان', aliases: ['South Khaitan'] },
  { name: 'جنوب سعد العبدالله', aliases: ['South Saad Al Abdulla'] },
  { name: 'شرق سعد العبدالله', aliases: ['East Saad Al Abdulla'] },
  { name: 'غرب سعد العبدالله', aliases: ['West Saad Al Abdulla'] },
];

// ─── الطرق الدائرية ──────────────────────────────────────────────────────────
const RING_ROADS: KuwaitLocation[] = [
  { name: 'الدائري الأول', aliases: ['First Ring Road', 'Ring Road 1', 'دائري 1'] },
  { name: 'الدائري الثاني', aliases: ['Second Ring Road', 'Ring Road 2', 'دائري 2'] },
  { name: 'الدائري الثالث', aliases: ['Third Ring Road', 'Ring Road 3', 'دائري 3'] },
  { name: 'الدائري الرابع', aliases: ['Fourth Ring Road', 'Ring Road 4', 'دائري 4'] },
  { name: 'الدائري الخامس', aliases: ['Fifth Ring Road', 'Ring Road 5', 'دائري 5'] },
  { name: 'الدائري السادس', aliases: ['Sixth Ring Road', 'Ring Road 6', 'دائري 6'] },
  { name: 'الدائري السابع', aliases: ['Seventh Ring Road', 'Ring Road 7', 'دائري 7'] },
];

// ─── الطرق الرئيسية ──────────────────────────────────────────────────────────
const MAIN_ROADS: KuwaitLocation[] = [
  { name: 'طريق الملك فهد', aliases: ['King Fahad Road', 'King Fahd Road'] },
  { name: 'طريق الملك فيصل', aliases: ['King Faisal Road'] },
  { name: 'طريق الشيخ زايد بن سلطان آل نهيان', aliases: ['Sheikh Zayed Road'] },
  { name: 'طريق جاسم محمد الخرافي', aliases: ['Jassim Mohammad Al Kharafi Road'] },
  { name: 'طريق جمال عبدالناصر', aliases: ['Jamal Abdul Nasser Road'] },
  { name: 'طريق الغزالي', aliases: ['Al Ghazali Road', 'Ghazali Road'] },
  { name: 'طريق الفحيحيل', aliases: ['Fahaheel Expressway', 'Fahaheel Road'] },
  { name: 'طريق السالمي', aliases: ['Salmi Road', 'Al Salmi Road'] },
  { name: 'طريق الوفرة', aliases: ['Wafra Road', 'Al Wafra Road'] },
  { name: 'طريق العبدلي', aliases: ['Abdali Road', 'Al Abdali Road'] },
  { name: 'طريق الصبية', aliases: ['Subbiya Road', 'Al Subbiya Road'] },
  { name: 'طريق المطلاع', aliases: ['Mutlaa Road', 'Al Mutlaa Road'] },
  { name: 'طريق كبد', aliases: ['Kabd Road'] },
];

// ─── القائمة الكاملة ─────────────────────────────────────────────────────────
export const KUWAIT_LOCATIONS: KuwaitLocation[] = [
  ...CAPITAL,
  ...HAWALLI,
  ...FARWANIYA,
  ...AHMADI,
  ...JAHRA,
  ...MUBARAK_ALKABEER,
  ...NEW_AREAS,
  ...RING_ROADS,
  ...MAIN_ROADS,
];

// ─── دالة البحث الذكي ────────────────────────────────────────────────────────
export function searchLocations(query: string, maxResults = 8): KuwaitLocation[] {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  const seen = new Set<string>();
  const results: KuwaitLocation[] = [];

  for (const loc of KUWAIT_LOCATIONS) {
    if (results.length >= maxResults) break;
    if (seen.has(loc.name)) continue;
    const nameMatch = loc.name.toLowerCase().includes(q);
    const aliasMatch = loc.aliases?.some((a) => a.toLowerCase().includes(q)) ?? false;
    if (nameMatch || aliasMatch) {
      seen.add(loc.name);
      results.push(loc);
    }
  }
  return results;
}
