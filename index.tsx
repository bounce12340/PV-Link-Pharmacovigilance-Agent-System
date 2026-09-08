
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import Root from './components/Root';
import { ThemeProvider } from './theme/ThemeContext';
import { LangProvider } from './i18n/LangContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <LangProvider>
        <Root />
      </LangProvider>
    </ThemeProvider>
  </React.StrictMode>
);
