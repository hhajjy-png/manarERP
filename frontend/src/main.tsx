import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RootErrorBoundary from './components/RootErrorBoundary';
import GlobalOverflowTooltip from './components/tooltip/GlobalOverflowTooltip';
import { resetRunStartUIState } from './lib/runStartUIState';
import { persistPreference } from './lib/syncedPreferences';
import { setFavouritesPersistence } from './letters/library/favourites';
// Offline fonts — no CDN required
// خطوط المستندات المرفقة (سجل الخطوط الرسمي) — الشرح في assets/fonts/fonts.css
import './assets/fonts/fonts.css';
import './styles/fonts.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import 'material-symbols/outlined.css';
import './app/theme.css';
import './app/tailwind.css';
import './styles/stitch-full.css';
import './styles/financial.css';

// قبل أول رسم: حالة العرض التي لا تُورَّث بين تشغيلين تعود إلى افتراضيها.
resetRunStartUIState();

// Zero Data Loss Certification Pack v1 — يُركَّب كاتب التفضيلات في محرك الخطابات
// من هنا لا من داخله: `src/letters/` محرك مغلق لا يستورد شيئًا خارجه (يفرضه
// `engineBoundary.test.ts`)، ومُركِّب التطبيق هو الموضع الصحيح لوصل المنافذ.
// بهذا تدخل مفضّلات ومؤخّرات الخطابات قاعدةَ البيانات فتنتقل مع النسخ والمزامنة.
setFavouritesPersistence(persistPreference);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary scope="root">
      <App />
      <GlobalOverflowTooltip />
    </RootErrorBoundary>
  </React.StrictMode>,
);
