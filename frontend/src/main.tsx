import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Offline fonts — no CDN required
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import 'material-symbols/outlined.css';
import './app/theme.css';
import './styles/stitch-full.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
