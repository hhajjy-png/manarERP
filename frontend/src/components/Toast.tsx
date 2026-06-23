import { useToastStore } from '../stores/toastStore';

export default function Toast() {
  const { toasts, remove } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" role="region" aria-label="إشعارات" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.variant}`}>
          <span>{t.message}</span>
          <button className="toast-close" onClick={() => remove(t.id)} aria-label="إغلاق الإشعار">✕</button>
        </div>
      ))}
    </div>
  );
}
