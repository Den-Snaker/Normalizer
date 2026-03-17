
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("Критическая ошибка: элемент #root не найден в DOM.");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Ошибка при рендеринге приложения:", error);
    rootElement.innerHTML = `<div style="padding: 20px; color: red; font-family: sans-serif;">
      <h2>Ошибка загрузки приложения</h2>
      <p>Пожалуйста, обновите страницу. Если ошибка повторяется, проверьте подключение к интернету или консоль браузера.</p>
    </div>`;
  }
}
