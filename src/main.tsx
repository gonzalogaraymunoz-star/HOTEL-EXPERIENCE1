import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import LanguageSwitcher from './components/LanguageSwitcher';
import {LanguageProvider} from './i18n/LanguageProvider';
import LocalizationBridge from './i18n/LocalizationBridge';
import './styles.css';
import './motion.css';
import './responsive.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <LocalizationBridge/>
      <App/>
      <LanguageSwitcher/>
    </LanguageProvider>
  </React.StrictMode>
);
