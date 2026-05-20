import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './styles/globals.css';

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="p-8 text-center">
          Κάτι πήγε στραβά. Κλείσε και άνοιξε ξανά την εφαρμογή.
        </div>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
