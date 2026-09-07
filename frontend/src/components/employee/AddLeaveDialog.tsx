import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useT } from '../../lib/i18n';
import DateInput from '../DateInput';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';
import {
  LEAVE_TYPE_FORM_LABEL,
  LEAVE_TYPE_VALUES,
  newLeaveRequestFields,
  type LeaveRequestFields,
} from './leaveRequestFields';

interface Props {
  employeeId: number;
  onClose: () => void;
  /** يُستدعى بعد نجاح الإنشاء — تعيد الصفحة تحميل نموذج القراءة الموحّد. */
  onSaved: () => void;
}

/**
 * إضافة إجازة إلى سجل الموظف — **بكامل بيانات طلب الإجازة**.
 *
 * ═══ لماذا كل الحقول هنا ═══
 * الحقول الخمسة أدناه هي حصرًا ما كان المستخدم يعبّئه يدويًا في صفحة
 * `LeaveRequest` عند كل طباعة: النوع، التاريخان، السبب، تاريخ العودة المتوقَّع، وتاريخ
 * تقديم الطلب.
 * كانت تُكتب في الصفحة وتضيع بانتهائها، فإعادة طباعة الطلب نفسه لاحقًا كانت تعني
 * إعادة تذكّره وكتابته من جديد. تُدخَل الآن مرة واحدة وتُحفظ مع سجل الإجازة، فتعود
 * معبّأة عند الطباعة. الألفاظ والخيارات وسلوك التاريخ مأخوذة من نفس مصدر تلك الصفحة
 * (`leaveRequestFields.ts` + مفاتيح `page.leaveReq.*`) فلا يختلف اللفظان.
 *
 * ═══ ما لا يُطلب هنا ═══
 * • **بيانات الموظف** (الاسم، الرقم الوظيفي، المسمّى، القسم): يقرؤها نموذج الطباعة
 *   من ملف الموظف عبر معرّفه — لا تُطلب يدويًا ولا تُخزَّن مرة ثانية.
 * • **`days`**: يشتقّه الخادم من التاريخين (`diffDays`). لا يُرسَل من هنا إطلاقًا.
 * • **`status`**: يفرضه الخادم `PENDING`؛ الاعتماد إجراء منفصل بصلاحية منفصلة.
 */
export default function AddLeaveDialog({ employeeId, onClose, onSaved }: Props) {
  const { t } = useT();

  // تاريخ اليوم قيمة ابتدائية لطلب **جديد** وحده — يُقيَّم عند فتح الحوار، ويبقى
  // بعدها ملكًا للمستخدم: أي تغيير يكتبه هو ما يُحفظ.
  const [fields, setFields] = useState<LeaveRequestFields>(() => newLeaveRequestFields());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof LeaveRequestFields>(key: K, value: LeaveRequestFields[K]) =>
    setFields((p) => ({ ...p, [key]: value }));

  const datesOutOfOrder = !!fields.startDate && !!fields.endDate && fields.endDate < fields.startDate;
  // تاريخ العودة اختياري، لكنه إن وُجد فلا يسبق نهاية الإجازة.
  const returnBeforeEnd =
    !!fields.expectedReturnDate && !!fields.endDate && fields.expectedReturnDate < fields.endDate;
  const canSubmit = !!fields.type && !!fields.startDate && !!fields.endDate && !datesOutOfOrder && !returnBeforeEnd;

  const save = async () => {
    // حارس ضدّ الإرسال المزدوج: النقر أثناء الحفظ لا يُطلق طلبًا ثانيًا.
    if (saving || !canSubmit) return;
    setSaving(true);
    setError('');
    try {
      // الجسم يطابق `leaveSchema` تمامًا — بلا `days` وبلا `status`.
      // الحقلان الاختياريان يُحذفان حين يكونان فارغين بدل إرسال نصّ فارغ.
      await api.post('/employees/leaves', {
        employeeId,
        type: fields.type,
        startDate: fields.startDate,
        endDate: fields.endDate,
        ...(fields.reason.trim() ? { reason: fields.reason.trim() } : {}),
        ...(fields.expectedReturnDate ? { expectedReturnDate: fields.expectedReturnDate } : {}),
        ...(fields.requestDate ? { requestDate: fields.requestDate } : {}),
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      icon="event_available"
      title={t('page.ent.add_leave')}
      subtitle={t('msg.ent.add_leave_subtitle')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="check" onClick={save} busy={saving} disabled={!canSubmit || saving}>
            {t('action.save')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <DialogSection>
        <div className="xpl-field">
          <label htmlFor="ent-leave-type">{t('page.leaveReq.field.leave_type')}</label>
          <select
            id="ent-leave-type"
            className="xpl-select"
            value={fields.type}
            onChange={(e) => set('type', e.target.value as LeaveRequestFields['type'])}
            aria-label={t('page.leaveReq.field.leave_type')}
          >
            {LEAVE_TYPE_VALUES.map((v) => (
              <option key={v} value={v}>{t(LEAVE_TYPE_FORM_LABEL[v])}</option>
            ))}
          </select>
        </div>

        <div className="xpl-field">
          <label>{t('page.leaveReq.field.request_date')}</label>
          <DateInput
            value={fields.requestDate}
            onChange={(v) => set('requestDate', v)}
            ariaLabel={t('page.leaveReq.field.request_date')}
          />
        </div>

        <div className="xpl-field">
          <label>{t('field.start_date')}</label>
          <DateInput value={fields.startDate} onChange={(v) => set('startDate', v)} ariaLabel={t('field.start_date')} />
        </div>

        <div className="xpl-field">
          <label>{t('field.end_date')}</label>
          <DateInput value={fields.endDate} onChange={(v) => set('endDate', v)} ariaLabel={t('field.end_date')} />
        </div>

        <div className="xpl-field">
          <label>{t('page.leaveReq.field.expected_return')}</label>
          <DateInput
            value={fields.expectedReturnDate}
            onChange={(v) => set('expectedReturnDate', v)}
            ariaLabel={t('page.leaveReq.field.expected_return')}
          />
        </div>

        <div className="xpl-field xpl-field--full">
          <label htmlFor="ent-leave-reason">{t('page.leaveReq.field.reason')}</label>
          <input
            id="ent-leave-reason"
            className="xpl-input"
            value={fields.reason}
            onChange={(e) => set('reason', e.target.value)}
            aria-label={t('page.leaveReq.field.reason')}
          />
        </div>

        {(datesOutOfOrder || returnBeforeEnd) && (
          <div className="xpl-field xpl-field--full">
            <div className="ent-recon-note ent-recon-note--warn">
              <span className="material-symbols-outlined" aria-hidden="true">warning</span>
              <span>{t(datesOutOfOrder ? 'msg.ent.leave_dates_out_of_order' : 'msg.ent.leave_return_before_end')}</span>
            </div>
          </div>
        )}

        {/* عدد الأيام يحتسبه الخادم من التاريخين — يُعرَض هنا كتذكير لا كحقل إدخال. */}
        <div className="xpl-field xpl-field--full">
          <span className="xpl-field-label">{t('msg.ent.leave_days_server_note')}</span>
        </div>
      </DialogSection>
    </Dialog>
  );
}
