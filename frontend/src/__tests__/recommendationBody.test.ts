/**
 * Recommendation Content Fallback — العقد.
 *
 * الخلفية لا ترسل `message`؛ ترسل `reason` و`suggestedAction` و`expectedImpact`.
 * المتن = **أوّل نصّ صالح** بالترتيب المعتمد، بلا دمج، وبلا نصّ مخترع عند الغياب.
 */
import { describe, it, expect } from 'vitest';
import { getRecommendationBody } from '../components/dashboard/command/types';
import type { RecommendationV2 } from '../components/dashboard/command/types';

const base: RecommendationV2 = { id: 'r1', priority: 'HIGH', title: 'عنوان', metric: '12' };

describe('getRecommendationBody — الأولوية', () => {
  it('message يتقدّم على الجميع حين يوجد', () => {
    expect(getRecommendationBody({
      ...base, message: 'م', reason: 'ر', suggestedAction: 'إ', expectedImpact: 'أ',
    })).toBe('م');
  });

  it('غياب message ⇒ reason', () => {
    expect(getRecommendationBody({ ...base, reason: 'ر', suggestedAction: 'إ', expectedImpact: 'أ' })).toBe('ر');
  });

  it('غياب message وreason ⇒ suggestedAction', () => {
    expect(getRecommendationBody({ ...base, suggestedAction: 'إ', expectedImpact: 'أ' })).toBe('إ');
  });

  it('لا يبقى إلا expectedImpact ⇒ هو المتن', () => {
    expect(getRecommendationBody({ ...base, expectedImpact: 'أ' })).toBe('أ');
  });

  it('**لا يدمج** الحقول في فقرة واحدة', () => {
    const body = getRecommendationBody({ ...base, reason: 'ر', suggestedAction: 'إ' });
    expect(body).toBe('ر');
    expect(body).not.toContain('إ');
  });
});

describe('getRecommendationBody — الغياب', () => {
  it('لا حقل صالح ⇒ undefined (لا نصّ وهمي ولا شرطة)', () => {
    const body = getRecommendationBody(base);
    expect(body).toBeUndefined();
    expect(body).not.toBe('—');
    expect(body).not.toBe('');
  });

  it('الفراغات وحدها ليست نصًّا — يُتخطّى الحقل إلى التالي', () => {
    expect(getRecommendationBody({ ...base, message: '   ', reason: 'ر' })).toBe('ر');
    expect(getRecommendationBody({ ...base, message: '', reason: '  ', suggestedAction: '' })).toBeUndefined();
  });

  it('القيمة غير النصّية لا تُعرض (البيانات تصل بلا تحقّق وقت التشغيل)', () => {
    const dirty = { ...base, message: 42, reason: 'ر' } as unknown as RecommendationV2;
    expect(getRecommendationBody(dirty)).toBe('ر');
  });
});

describe('الشكل الفعلي للـ API — الحالة التي أفرغت البطاقات', () => {
  it('{ id, priority, title, reason, expectedImpact, suggestedAction, metric } ⇒ يعرض reason', () => {
    const fromApi = {
      id: 'rec-v2-high-receivables',
      priority: 'HIGH',
      title: 'ذمم مرتفعة',
      reason: 'الذمم تتجاوز 155,340.500 KWD',
      expectedImpact: 'تحسين السيولة',
      suggestedAction: 'تكثيف التحصيل',
      metric: '155,340.500',
    } as RecommendationV2;
    expect(getRecommendationBody(fromApi)).toBe('الذمم تتجاوز 155,340.500 KWD');
  });
});
