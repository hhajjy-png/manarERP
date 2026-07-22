import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../../lib/i18n';
import { EMPLOYEE_FORM_CARDS } from '../../forms/shared/formsRegistry';
import { Icon } from '../explorer/ExplorerKit';

/**
 * درج الموظف — «نماذج الموظف»: قائمة منبثقة مبنيّة من سجل النماذج الإدارية نفسه
 * (`EMPLOYEE_FORM_CARDS`)، فأي نموذج جديد يُضاف هناك يظهر هنا تلقائيًا بلا أي
 * تعديل على هذا الملف. اختيار بند ينقل **معرّف الموظف والنموذج فقط** إلى مركز
 * النماذج (`?employee=<id>&form=<key>`)، الذي يُنفّذ نفس مقبض الطباعة المستخدَم
 * عند النقر اليدوي — بلا تكرار منطق ولا بيانات موظف مكرّرة ولا ذاكرة مؤقتة.
 */
export default function EmployeeFormsMenu({ employeeId }: { employeeId: number }) {
  const navigate = useNavigate();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function openForm(formKey: string) {
    setOpen(false);
    navigate(`/forms?employee=${employeeId}&form=${formKey}`);
  }

  function focusItem(index: number) {
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (!items.length) return;
    const clamped = ((index % items.length) + items.length) % items.length;
    items[clamped]?.focus();
  }

  function onTriggerKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusItem(0));
    }
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(EMPLOYEE_FORM_CARDS.length - 1);
    }
  }

  return (
    <div className="xpl-quick-action-menu" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="xpl-quick-action"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="xpl-quick-action-icon"><Icon name="article" /></span>
        <span className="xpl-quick-action-label">{t('action.employee_forms_menu')}</span>
      </button>
      {open && (
        <div className="xpl-quick-action-popover" role="menu" aria-label={t('action.employee_forms_menu')}>
          {EMPLOYEE_FORM_CARDS.map((card, i) => (
            <button
              key={card.key}
              type="button"
              role="menuitem"
              ref={(el) => { itemRefs.current[i] = el; }}
              className="xpl-quick-action-popover-item"
              onClick={() => openForm(card.key)}
              onKeyDown={(e) => onMenuKeyDown(e, i)}
            >
              <span className="xpl-quick-action-popover-icon" aria-hidden="true">{card.icon}</span>
              {t(card.titleKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
