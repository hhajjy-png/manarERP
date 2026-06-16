export type LocationCategory = 'residential' | 'industrial' | 'ring-road' | 'highway' | 'road-project' | 'housing-project';

export interface KuwaitLocation {
  name: string;
  category: LocationCategory;
  aliases?: string[];
}

export const CATEGORY_LABELS: Record<LocationCategory, string> = {
  'residential': 'مناطق سكنية',
  'industrial': 'مناطق صناعية',
  'ring-road': 'طرق دائرية',
  'highway': 'طرق رئيسية',
  'road-project': 'مشاريع طرق',
  'housing-project': 'مشاريع إسكانية',
};

// ─── محافظة العاصمة ──────────────────────────────────────────────────────────
const CAPITAL: KuwaitLocation[] = [
  { name: 'شرق', category: 'residential', aliases: ['Sharq'] },
  { name: 'القبلة', category: 'residential', aliases: ['Qibla', 'Al Qibla'] },
  { name: 'المرقاب', category: 'residential', aliases: ['Mirqab', 'Al Mirqab'] },
  { name: 'الدسمة', category: 'residential', aliases: ['Dasman', 'Al Dasman'] },
  { name: 'الدعية', category: 'residential', aliases: ['Daiya', 'Al Daiya'] },
  { name: 'بنيد القار', category: 'residential', aliases: ['Bneid Al Gar'] },
  { name: 'الفيحاء', category: 'residential', aliases: ['Faiha', 'Al Faiha'] },
  { name: 'الشامية', category: 'residential', aliases: ['Shamiya', 'Al Shamiya'] },
  { name: 'الخالدية', category: 'residential', aliases: ['Khaldiya', 'Al Khaldiya'] },
  { name: 'كيفان', category: 'residential', aliases: ['Kaifan'] },
  { name: 'القادسية', category: 'residential', aliases: ['Qadisiya', 'Al Qadisiya'] },
  { name: 'قرطبة', category: 'residential', aliases: ['Qortuba', 'Qurtuba'] },
  { name: 'اليرموك', category: 'residential', aliases: ['Yarmouk', 'Al Yarmouk'] },
  { name: 'الصليبخات', category: 'residential', aliases: ['Shuwaikh', 'Sulaibikhat'] },
  { name: 'الدوحة', category: 'residential', aliases: ['Doha', 'Al Doha'] },
  { name: 'غرناطة', category: 'residential', aliases: ['Granada', 'Gharnata'] },
  { name: 'جابر الأحمد', category: 'residential', aliases: ['Jaber Al Ahmad'] },
  { name: 'القيروان', category: 'residential', aliases: ['Qairawān', 'Al Qayrawan'] },
  { name: 'النزهة', category: 'residential', aliases: ['Nuzha', 'Al Nuzha'] },
  { name: 'الروضة', category: 'residential', aliases: ['Rawda', 'Al Rawda'] },
  { name: 'إشبيلية', category: 'residential', aliases: ['Ishbiliya', 'Essbiliya'] },
  { name: 'الرحاب', category: 'residential', aliases: ['Rehab', 'Al Rehab'] },
  { name: 'اليوسفية', category: 'residential', aliases: ['Yousifiya', 'Al Yousifiya'] },
  { name: 'صباح السالم', category: 'residential', aliases: ['Sabah Al Salem'] },
  { name: 'المنصورية', category: 'residential', aliases: ['Mansuriya', 'Al Mansuriya'] },
  { name: 'ضاحية عبدالله السالم', category: 'residential', aliases: ['Abdullah Al Salem'] },
  { name: 'الزيتون', category: 'residential', aliases: ['Zaytoon', 'Al Zaytoon'] },
  { name: 'عبدالله السالم', category: 'residential', aliases: ['Abdullah Al Salem District'] },
  { name: 'النهضة', category: 'residential', aliases: ['Nahda', 'Al Nahda'] },
  { name: 'شمال غرب الصليبيخات', category: 'residential', aliases: ['Northwest Sulaibikhat'] },
  { name: 'الصالحية', category: 'residential', aliases: ['Salhiya', 'Al Salhiya'] },
  { name: 'الوطية', category: 'residential', aliases: ['Watiya', 'Al Watiya'] },
  { name: 'جبلة', category: 'residential', aliases: ['Jibla'] },
  { name: 'الشويخ الصناعية', category: 'industrial', aliases: ['Shuwaikh Industrial'] },
];

// ─── محافظة حولي ─────────────────────────────────────────────────────────────
const HAWALLI: KuwaitLocation[] = [
  { name: 'السالمية', category: 'residential', aliases: ['Salmiya', 'Al Salmiya'] },
  { name: 'الرميثية', category: 'residential', aliases: ['Rumaithiya', 'Al Rumaithiya'] },
  { name: 'الجابرية', category: 'residential', aliases: ['Jabriya', 'Al Jabriya'] },
  { name: 'بيان', category: 'residential', aliases: ['Bayan'] },
  { name: 'مشرف', category: 'residential', aliases: ['Mishrif'] },
  { name: 'سلوى', category: 'residential', aliases: ['Salwa'] },
  { name: 'الشعب', category: 'residential', aliases: ['Shaab', 'Al Shaab'] },
  { name: 'البدع', category: 'residential', aliases: ['Bida', 'Al Bidea'] },
  { name: 'السلام', category: 'residential', aliases: ['Salam', 'Al Salam'] },
  { name: 'الزهراء', category: 'residential', aliases: ['Zahra', 'Al Zahra'] },
  { name: 'الصديق', category: 'residential', aliases: ['Siddeeq', 'Al Siddeeq'] },
  { name: 'حطين', category: 'residential', aliases: ['Hutteen', 'Al Hutteen'] },
  { name: 'الشهداء', category: 'residential', aliases: ['Shuhada', 'Al Shuhada'] },
  { name: 'حولي', category: 'residential', aliases: ['Hawalli'] },
  { name: 'النقرة', category: 'residential', aliases: ['Nuqra', 'Al Nuqra'] },
  { name: 'أنجفة', category: 'residential', aliases: ['Anjafa'] },
  { name: 'طارق', category: 'residential', aliases: ['Tariq'] },
  { name: 'السرة', category: 'residential', aliases: ['Surra', 'Al Surra'] },
  { name: 'ميدان حولي', category: 'residential', aliases: ['Hawalli Square', 'Midan Hawalli'] },
  { name: 'مبارك العبدالله', category: 'residential', aliases: ['Mubarak Al Abdullah'] },
];

// ─── محافظة الفروانية ─────────────────────────────────────────────────────────
const FARWANIYA: KuwaitLocation[] = [
  { name: 'الفروانية', category: 'residential', aliases: ['Farwaniya', 'Al Farwaniya'] },
  { name: 'خيطان', category: 'residential', aliases: ['Khaitan'] },
  { name: 'العمرية', category: 'residential', aliases: ['Umariya', 'Amriya'] },
  { name: 'الرابية', category: 'residential', aliases: ['Rabiya', 'Al Rabiya'] },
  { name: 'الأندلس', category: 'residential', aliases: ['Andalus', 'Al Andalus'] },
  { name: 'الفردوس', category: 'residential', aliases: ['Firdous', 'Al Firdous'] },
  { name: 'العارضية', category: 'residential', aliases: ['Ardhiya', 'Al Ardhiya'] },
  { name: 'عبدالله المبارك', category: 'residential', aliases: ['Abdullah Al Mubarak'] },
  { name: 'غرب عبدالله المبارك', category: 'residential', aliases: ['West Abdullah Al Mubarak'] },
  { name: 'جنوب عبدالله المبارك', category: 'residential', aliases: ['South Abdullah Al Mubarak'] },
  { name: 'الضجيج', category: 'residential', aliases: ['Dajeej', 'Al Dajeej'] },
  { name: 'الرقعي', category: 'residential', aliases: ['Rego', 'Al Reqai'] },
  { name: 'أبو فطيرة', category: 'residential', aliases: ['Abu Fteira'] },
  { name: 'الفنيطيس', category: 'residential', aliases: ['Funaitees', 'Al Funaitees'] },
  { name: 'الريّان', category: 'residential', aliases: ['Riyyan', 'Al Riyyan'] },
  { name: 'الحساوي', category: 'residential', aliases: ['Hasawi', 'Al Hasawi'] },
  { name: 'العباسية', category: 'residential', aliases: ['Abbasiya', 'Al Abbasiya'] },
  { name: 'أبرق خيطان', category: 'residential', aliases: ['Abraq Khaitan'] },
  { name: 'خيطان الجديدة', category: 'residential', aliases: ['New Khaitan', 'Khaitan Al Jadida'] },
  { name: 'العارضية الصناعية', category: 'industrial', aliases: ['Ardhiya Industrial'] },
];

// ─── محافظة الأحمدي ──────────────────────────────────────────────────────────
const AHMADI: KuwaitLocation[] = [
  { name: 'العدان', category: 'residential', aliases: ['Addan', 'Al Addan'] },
  { name: 'القصور', category: 'residential', aliases: ['Qusor', 'Al Qusour'] },
  { name: 'القرين', category: 'residential', aliases: ['Qurain', 'Al Qurain'] },
  { name: 'المسايل', category: 'residential', aliases: ['Masayel', 'Al Masayel'] },
  { name: 'المسيلة', category: 'residential', aliases: ['Maseela', 'Al Maseela'] },
  { name: 'أبو الحصانية', category: 'residential', aliases: ['Abu Al Hasaniya'] },
  { name: 'الفحيحيل', category: 'residential', aliases: ['Fahaheel', 'Al Fahaheel'] },
  { name: 'المنقف', category: 'residential', aliases: ['Mangaf', 'Al Mangaf'] },
  { name: 'أبو حليفة', category: 'residential', aliases: ['Abu Halifa'] },
  { name: 'الفنطاس', category: 'residential', aliases: ['Fintas', 'Al Fintas'] },
  { name: 'العقيلة', category: 'residential', aliases: ['Aqila', 'Al Aqila'] },
  { name: 'المهبولة', category: 'residential', aliases: ['Mahboula', 'Al Mahboula'] },
  { name: 'الرقة', category: 'residential', aliases: ['Ruqa', 'Al Ruqa'] },
  { name: 'هدية', category: 'residential', aliases: ['Hadiya'] },
  { name: 'الظهر', category: 'residential', aliases: ['Daher', 'Al Daher'] },
  { name: 'الصباحية', category: 'residential', aliases: ['Sabahiya', 'Al Sabahiya'] },
  { name: 'جابر العلي', category: 'residential', aliases: ['Jaber Al Ali'] },
  { name: 'علي صباح السالم', category: 'residential', aliases: ['Ali Sabah Al Salem'] },
  { name: 'الأحمدي', category: 'residential', aliases: ['Ahmadi', 'Al Ahmadi'] },
  { name: 'الوفرة السكنية', category: 'residential', aliases: ['Wafra Residential', 'Al Wafra'] },
  { name: 'جنوب صباح الأحمد', category: 'residential', aliases: ['South Sabah Al Ahmad'] },
  { name: 'مدينة صباح الأحمد', category: 'residential', aliases: ['Sabah Al Ahmad City'] },
  { name: 'صباح الأحمد البحرية', category: 'residential', aliases: ['Sabah Al Ahmad Marine'] },
  { name: 'مدينة الخيران', category: 'residential', aliases: ['Khairan City', 'Al Khairan'] },
  { name: 'فهد الأحمد', category: 'residential', aliases: ['Fahad Al Ahmad'] },
  { name: 'ميناء عبدالله', category: 'industrial', aliases: ['Mina Abdullah', 'Abdullah Port'] },
  { name: 'الشعيبة الشرقية', category: 'industrial', aliases: ['East Shuaiba', 'Shuaiba East'] },
  { name: 'الشعيبة الغربية', category: 'industrial', aliases: ['West Shuaiba', 'Shuaiba West'] },
  { name: 'شرق الأحمدي', category: 'industrial', aliases: ['East Ahmadi', 'Ahmadi East'] },
  { name: 'ميناء الأحمدي', category: 'industrial', aliases: ['Ahmadi Port', 'Mina Al Ahmadi'] },
];

// ─── محافظة الجهراء ──────────────────────────────────────────────────────────
const JAHRA: KuwaitLocation[] = [
  { name: 'الجهراء', category: 'residential', aliases: ['Jahra', 'Al Jahra'] },
  { name: 'تيماء', category: 'residential', aliases: ['Tayma', 'Al Tayma'] },
  { name: 'النعيم', category: 'residential', aliases: ['Naeem', 'Al Naeem'] },
  { name: 'الواحة', category: 'residential', aliases: ['Waha', 'Al Waha'] },
  { name: 'العيون', category: 'residential', aliases: ['Uyun', 'Al Uyun'] },
  { name: 'القصر', category: 'residential', aliases: ['Qasr', 'Al Qasr'] },
  { name: 'النسيم', category: 'residential', aliases: ['Naseem', 'Al Naseem'] },
  { name: 'سعد العبدالله', category: 'residential', aliases: ['Saad Al Abdullah', 'Saad Al Abdulla'] },
  { name: 'الصليبية', category: 'residential', aliases: ['Sulaibiya', 'Al Sulaibiya'] },
  { name: 'كبد', category: 'residential', aliases: ['Kabd'] },
  { name: 'العبدلي', category: 'residential', aliases: ['Abdali', 'Al Abdali'] },
  { name: 'جنوب سعد العبدالله', category: 'residential', aliases: ['South Saad Al Abdulla'] },
  { name: 'شرق سعد العبدالله', category: 'residential', aliases: ['East Saad Al Abdulla'] },
  { name: 'غرب سعد العبدالله', category: 'residential', aliases: ['West Saad Al Abdulla'] },
  { name: 'مدينة المطلاع', category: 'residential', aliases: ['Mutlaa City', 'Al Mutlaa', 'المطلاع', 'Mutla'] },
  { name: 'جنوب الجهراء', category: 'residential', aliases: ['South Jahra', 'Jahra South'] },
  { name: 'أمغرة', category: 'residential', aliases: ['Amghara'] },
  { name: 'السالمي', category: 'residential', aliases: ['Salmi', 'Al Salmi'] },
  { name: 'الصليبية الصناعية', category: 'industrial', aliases: ['Sulaibiya Industrial'] },
  { name: 'الجهراء الصناعية', category: 'industrial', aliases: ['Jahra Industrial'] },
  { name: 'مشروع المطلاع', category: 'housing-project', aliases: ['Mutlaa Project', 'Al Mutlaa Project', 'Mutla Project'] },
];

// ─── محافظة مبارك الكبير ─────────────────────────────────────────────────────
const MUBARAK_ALKABEER: KuwaitLocation[] = [
  { name: 'مبارك الكبير', category: 'residential', aliases: ['Mubarak Al Kabeer'] },
  { name: 'أبو الحصانية', category: 'residential', aliases: ['Abu Al Hasaniya'] },
  { name: 'المسايل', category: 'residential', aliases: ['Masayel', 'Al Masayel'] },
  { name: 'القرين', category: 'residential', aliases: ['Qurain', 'Al Qurain'] },
  { name: 'الفنيطيس', category: 'residential', aliases: ['Funaitees', 'Al Funaitees'] },
  { name: 'صباح السالم', category: 'residential', aliases: ['Sabah Al Salem'] },
  { name: 'أبو فطيرة', category: 'residential', aliases: ['Abu Fteira'] },
  { name: 'المسيلة', category: 'residential', aliases: ['Maseela', 'Al Maseela'] },
  { name: 'صبحان', category: 'industrial', aliases: ['Subhan', 'Sabhan'] },
];

// ─── مناطق جديدة (جنوب خيطان) ───────────────────────────────────────────────
const NEW_AREAS: KuwaitLocation[] = [
  { name: 'جنوب خيطان', category: 'residential', aliases: ['South Khaitan'] },
];

// ─── الطرق الدائرية ──────────────────────────────────────────────────────────
const RING_ROADS: KuwaitLocation[] = [
  { name: 'الدائري الأول', category: 'ring-road', aliases: ['First Ring Road', 'Ring Road 1', 'دائري 1', 'طريق الشيخ جابر الأحمد الصباح'] },
  { name: 'الدائري الثاني', category: 'ring-road', aliases: ['Second Ring Road', 'Ring Road 2', 'دائري 2', 'طريق الشيخ صباح الأحمد'] },
  { name: 'الدائري الثالث', category: 'ring-road', aliases: ['Third Ring Road', 'Ring Road 3', 'دائري 3', 'طريق الشيخ راشد'] },
  { name: 'الدائري الرابع', category: 'ring-road', aliases: ['Fourth Ring Road', 'Ring Road 4', 'دائري 4', 'طريق الإسكان'] },
  { name: 'الدائري الخامس', category: 'ring-road', aliases: ['Fifth Ring Road', 'Ring Road 5', 'دائري 5', 'طريق المطار'] },
  { name: 'الدائري السادس', category: 'ring-road', aliases: ['Sixth Ring Road', 'Ring Road 6', 'دائري 6', 'طريق الغزالي'] },
  { name: 'الدائري السابع', category: 'ring-road', aliases: ['Seventh Ring Road', 'Ring Road 7', 'دائري 7', 'طريق الجهراء'] },
];

// ─── الطرق الرئيسية ──────────────────────────────────────────────────────────
const MAIN_ROADS: KuwaitLocation[] = [
  { name: 'طريق الملك فهد', category: 'highway', aliases: ['King Fahad Road', 'King Fahd Road'] },
  { name: 'طريق الملك فيصل', category: 'highway', aliases: ['King Faisal Road'] },
  { name: 'طريق الشيخ زايد بن سلطان آل نهيان', category: 'highway', aliases: ['Sheikh Zayed Road'] },
  { name: 'طريق جاسم محمد الخرافي', category: 'highway', aliases: ['Jassim Mohammad Al Kharafi Road'] },
  { name: 'طريق جمال عبدالناصر', category: 'highway', aliases: ['Jamal Abdul Nasser Road'] },
  { name: 'طريق الغزالي', category: 'highway', aliases: ['Al Ghazali Road', 'Ghazali Road'] },
  { name: 'طريق الفحيحيل', category: 'highway', aliases: ['Fahaheel Expressway', 'Fahaheel Road'] },
  { name: 'طريق السالمي', category: 'highway', aliases: ['Salmi Road', 'Al Salmi Road'] },
  { name: 'طريق الوفرة', category: 'highway', aliases: ['Wafra Road', 'Al Wafra Road'] },
  { name: 'طريق العبدلي', category: 'highway', aliases: ['Abdali Road', 'Al Abdali Road'] },
  { name: 'طريق الصبية', category: 'highway', aliases: ['Subbiya Road', 'Al Subbiya Road'] },
  { name: 'طريق المطلاع', category: 'highway', aliases: ['Mutlaa Road', 'Al Mutlaa Road'] },
  { name: 'طريق كبد', category: 'highway', aliases: ['Kabd Road'] },
  { name: 'طريق الشيخ جابر الأحمد', category: 'highway', aliases: ['Sheikh Jaber Al Ahmad Road', 'Jamal Road'] },
  { name: 'طريق الشيخ محمد بن ناصر الصباح', category: 'highway', aliases: ['Sheikh Mohammed Bin Nasser Road'] },
  { name: 'طريق خليج الكويت', category: 'highway', aliases: ['Kuwait Bay Road', 'Gulf Road'] },
  { name: 'طريق الهجرة', category: 'highway', aliases: ['Al Hijra Road', 'Hijra Road'] },
  { name: 'طريق عبدالله المبارك', category: 'highway', aliases: ['Abdullah Al Mubarak Road'] },
  { name: 'طريق جابر الأحمد', category: 'highway', aliases: ['Jaber Al Ahmad Road'] },
];

// ─── مشاريع الطرق ────────────────────────────────────────────────────────────
const ROAD_PROJECTS: KuwaitLocation[] = [
  { name: 'مشروع تطوير الدائري الثاني', category: 'road-project', aliases: ['Second Ring Road Development', 'Ring Road 2 Project'] },
  { name: 'مشروع تطوير الدائري الثالث', category: 'road-project', aliases: ['Third Ring Road Development', 'Ring Road 3 Project'] },
  { name: 'مشروع تطوير الدائري الرابع', category: 'road-project', aliases: ['Fourth Ring Road Development', 'Ring Road 4 Project'] },
  { name: 'مشروع تطوير الدائري الخامس', category: 'road-project', aliases: ['Fifth Ring Road Development', 'Ring Road 5 Project'] },
  { name: 'مشروع طريق الفحيحيل السريع', category: 'road-project', aliases: ['Fahaheel Expressway Project'] },
  { name: 'مشروع طريق الصبية', category: 'road-project', aliases: ['Subbiya Road Project'] },
  { name: 'مشروع الطريق الساحلي', category: 'road-project', aliases: ['Coastal Road Project'] },
  { name: 'مشروع طريق الجهراء', category: 'road-project', aliases: ['Jahra Road Project'] },
  { name: 'مشروع تطوير طريق المطلاع', category: 'road-project', aliases: ['Mutlaa Road Development Project'] },
];

// ─── مشاريع إسكانية ──────────────────────────────────────────────────────────
const HOUSING_PROJECTS: KuwaitLocation[] = [
  { name: 'مشروع جنوب سعد العبدالله', category: 'housing-project', aliases: ['South Saad Al Abdulla Housing', 'South Saad Al Abdullah Project'] },
  { name: 'مشروع جنوب خيطان', category: 'housing-project', aliases: ['South Khaitan Housing', 'South Khaitan Project'] },
  { name: 'مشروع الخيران السكني', category: 'housing-project', aliases: ['Khairan Residential Project'] },
  { name: 'مشروع الوفرة السكني', category: 'housing-project', aliases: ['Wafra Residential Project', 'Al Wafra Housing'] },
  { name: 'مشروع مدينة صباح الأحمد', category: 'housing-project', aliases: ['Sabah Al Ahmad City Project'] },
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
  ...ROAD_PROJECTS,
  ...HOUSING_PROJECTS,
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

// ─── البحث المجمّع حسب التصنيف ───────────────────────────────────────────────
export interface CategoryGroup {
  category: LocationCategory;
  label: string;
  items: KuwaitLocation[];
}

export function searchLocationsGrouped(query: string, maxResults = 10): CategoryGroup[] {
  const flat = searchLocations(query, maxResults);
  const map = new Map<LocationCategory, KuwaitLocation[]>();

  for (const loc of flat) {
    const existing = map.get(loc.category);
    if (existing) {
      existing.push(loc);
    } else {
      map.set(loc.category, [loc]);
    }
  }

  const categoryOrder: LocationCategory[] = ['residential', 'industrial', 'ring-road', 'highway', 'road-project', 'housing-project'];
  const groups: CategoryGroup[] = [];

  for (const cat of categoryOrder) {
    const items = map.get(cat);
    if (items && items.length > 0) {
      groups.push({ category: cat, label: CATEGORY_LABELS[cat], items });
    }
  }

  return groups;
}
