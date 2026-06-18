const NATIONALITY_EN: Record<string, string> = {
  'هندي': 'INDIAN',
  'هندية': 'INDIAN',
  'باكستاني': 'PAKISTANI',
  'باكستانية': 'PAKISTANI',
  'مصري': 'EGYPTIAN',
  'مصرية': 'EGYPTIAN',
  'سوري': 'SYRIAN',
  'سورية': 'SYRIAN',
  'تركي': 'TURKISH',
  'تركية': 'TURKISH',
  'بنغلاديشي': 'BANGLADESHI',
  'بنغلاديشية': 'BANGLADESHI',
  'فلبيني': 'FILIPINO',
  'فلبينية': 'FILIPINO',
  'نيبالي': 'NEPALESE',
  'نيبالية': 'NEPALESE',
  'سريلانكي': 'SRI LANKAN',
  'سريلانكية': 'SRI LANKAN',
  'كويتي': 'KUWAITI',
  'كويتية': 'KUWAITI',
  'أردني': 'JORDANIAN',
  'أردنية': 'JORDANIAN',
  'يمني': 'YEMENI',
  'يمنية': 'YEMENI',
  'إثيوبي': 'ETHIOPIAN',
  'إثيوبية': 'ETHIOPIAN',
  'إندونيسي': 'INDONESIAN',
  'إندونيسية': 'INDONESIAN',
};

const JOB_TITLE_EN: Record<string, string> = {
  'سائق شاحنة': 'HEAVY DRIVER',
  'سائق عموم آليات الطرق': 'GENERAL ROAD EQUIPMENT DRIVER',
  'سائق سيارة خصوصي': 'PRIVATE CAR DRIVER',
  'مندوب مبيعات': 'SALES REPRESENTATIVE',
  'عامل': 'WORKER',
  'عامل عام': 'GENERAL WORKER',
  'فني': 'TECHNICIAN',
  'فني صيانة': 'MAINTENANCE TECHNICIAN',
  'مشرف': 'SUPERVISOR',
  'مهندس': 'ENGINEER',
  'محاسب': 'ACCOUNTANT',
  'حارس': 'GUARD',
  'سائق': 'DRIVER',
};

export function getNationalityEn(ar: string | null | undefined): string {
  if (!ar) return '—';
  return NATIONALITY_EN[ar.trim()] ?? ar;
}

export function getJobTitleEn(ar: string | null | undefined): string {
  if (!ar) return '—';
  return JOB_TITLE_EN[ar.trim()] ?? ar;
}
