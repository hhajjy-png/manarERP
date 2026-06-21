import type { PrintTemplateCategory, PrintTemplateDefinition } from '../engine/types';
import { getPrintTemplates } from '../engine/registry';
import type { PrintPaperType, PrintProfile } from '../hooks/usePrintProfile';
import styles from './PrintTemplateSelector.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PrintTemplateSelectorProps {
  category: PrintTemplateCategory;
  profile: PrintProfile;
  onSelect: (profile: PrintProfile) => void;
  /** When false, the paper-type toggle is hidden (useful in contexts where
   *  letterhead/plain is controlled elsewhere). Default: true. */
  showPaperToggle?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Isolated template picker for print dialogs.
 *
 * Renders a list of available template names + a plain-a4 / letterhead toggle.
 * Does NOT import any print page or production route — safe to include in any
 * modal.
 *
 * Usage (Phase 2):
 * ```tsx
 * const [profile, setProfile] = usePrintProfile('invoice');
 *
 * <PrintTemplateSelector
 *   category="invoice"
 *   profile={profile}
 *   onSelect={setProfile}
 * />
 * ```
 */
export default function PrintTemplateSelector({
  category,
  profile,
  onSelect,
  showPaperToggle = true,
}: PrintTemplateSelectorProps) {
  const templates = getPrintTemplates(category);

  // Only show original variants in the selector; the blank variant is resolved
  // automatically by usePrintTemplate when paperType === 'letterhead'.
  const originals = templates.filter((t) => t.variant === 'original');

  function selectTemplate(t: PrintTemplateDefinition) {
    onSelect({ ...profile, templateId: t.id });
  }

  function selectPaper(paperType: PrintPaperType) {
    onSelect({ ...profile, paperType });
  }

  return (
    <div className={styles.root} dir="rtl">
      <div className={styles.label}>اختر تصميم الطباعة</div>

      <div className={styles.list}>
        {originals.map((t) => {
          const isSelected = profile.templateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`${styles.item} ${isSelected ? styles.selected : ''}`}
              onClick={() => selectTemplate(t)}
            >
              <span className={styles.radio}>
                {isSelected && <span className={styles.radioDot} />}
              </span>
              <span className={styles.meta}>
                <span className={styles.nameAr}>{t.nameAr}</span>
                <span className={styles.nameEn}>{t.nameEn}</span>
              </span>
            </button>
          );
        })}
      </div>

      {showPaperToggle && (
        <>
          <div className={styles.sectionLabel}>نوع الورق</div>
          <div className={styles.paperToggle}>
            <button
              type="button"
              className={`${styles.paperBtn} ${profile.paperType === 'plain-a4' ? styles.active : ''}`}
              onClick={() => selectPaper('plain-a4')}
            >
              A4 عادي
            </button>
            <button
              type="button"
              className={`${styles.paperBtn} ${profile.paperType === 'letterhead' ? styles.active : ''}`}
              onClick={() => selectPaper('letterhead')}
            >
              ترويسة مطبوعة
            </button>
          </div>
        </>
      )}
    </div>
  );
}
