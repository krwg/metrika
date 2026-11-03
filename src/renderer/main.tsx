import React, { Component, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { CurrencyProvider } from './currency';
import './App.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'Segoe UI, sans-serif' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Метрика: сбой интерфейса</h1>
          <p style={{ color: '#5f6368', marginBottom: 16 }}>{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ padding: '8px 14px', cursor: 'pointer' }}
          >
            Перезагрузить окно
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </I18nProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
