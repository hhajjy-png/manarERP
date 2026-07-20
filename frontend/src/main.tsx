import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RootErrorBoundary from './components/RootErrorBoundary';
import GlobalOverflowTooltip from './components/tooltip/GlobalOverflowTooltip';
// Offline fonts — no CDN required
import './styles/fonts.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import 'material-symbols/outlined.css';
import './app/theme.css';
import './app/tailwind.css';
import './styles/stitch-full.css';
import './styles/financial.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary scope="root">
      <App />
      <GlobalOverflowTooltip />
    </RootErrorBoundary>
  </React.StrictMode>,
);
