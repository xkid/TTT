import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global error handling for debugging production issues
window.onerror = (message, source, lineno, colno, error) => {
  console.error('Global Error caught:', message, 'at', source, lineno, ':', colno, error);
  return false;
};

window.onunhandledrejection = (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);