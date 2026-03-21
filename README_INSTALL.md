# NORMALIZER - Инструкция по установке

## Быстрый старт (для новой установки)

### Шаг 1: Установите необходимые программы

Перед запуском убедитесь, что установлены:

1. **Git** - https://git-scm.com/download/win
   - Скачайте и установите
   - При установке выберите "Git from the command line"

2. **Node.js 20+** - https://nodejs.org/
   - Скачайте LTS версию (рекомендуется 20.x)
   - При установке отметьте "Add to PATH"

3. **Python 3.12+** - https://www.python.org/downloads/
   - Скачайте последнюю версию
   - При установке отметьте "Add Python to PATH"

### Шаг 2: Запустите установку

1. Скачайте файл `install.bat` из репозитория
2. Поместите его в папку, где хотите установить программу
3. Запустите `install.bat` двойным кликом
4. Дождитесь завершения установки

### Шаг 3: Настройте API ключи

Отредактируйте файл `Normalizer\old\.env.local`:

```
VITE_GEMINI_API_KEY=ваш_ключ_gemini
VITE_OPENROUTER_API_KEY=ваш_ключ_openrouter
VITE_API_URL=http://localhost:8000
```

### Шаг 4: Запустите приложение

Дважды кликните на `start.bat`

---

## Ежедневное использование

### Запуск

Дважды кликните на `start.bat` или запустите `servers.bat` для интерактивного меню.

- Frontend: http://localhost:3000/
- Backend: http://localhost:8000/

### Остановка

Дважды кликните на `stop.bat` или используйте меню `servers.bat`

### Обновление с GitHub

Дважды кликните на `update.bat`

Это обновит:
- Код программы с GitHub
- Зависимости Backend (pip)
- Зависимости Frontend (npm)
- Соберёт Frontend заново

### Запуск тестов

Дважды кликните на `run_tests.bat`

---

## Файлы

| Файл | Описание |
|------|----------|
| `install.bat` | Первичная установка |
| `start.bat` | Запуск серверов |
| `stop.bat` | Остановка серверов |
| `update.bat` | Обновление с GitHub |
| `run_tests.bat` | Запуск тестов |
| `servers.bat` | Интерактивное меню |

---

## Структура папок

```
Normalizer/
├── install.bat          # Установка
├── start.bat            # Запуск
├── stop.bat             # Остановка
├── update.bat           # Обновление
├── run_tests.bat       # Тесты
├── servers.bat          # Интерактивное меню
├── backend/             # Python Backend
│   ├── main.py          # Точка входа
│   ├── requirements.txt # Зависимости
│   └── .env             # Конфигурация
├── old/                  # React Frontend
│   ├── src/             # Исходный код
│   ├── .env.local       # API ключи
│   └── package.json     # Зависимости
└── Описание функционала.docx
```

---

## Устранение проблем

### Порт 8000 занят

```cmd
netstat -ano | findstr :8000
taskkill /F /PID <номер_процесса>
```

### Порт 3000 занят

```cmd
netstat -ano | findstr :3000
taskkill /F /PID <номер_процесса>
```

### Ошибка npm

```cmd
cd Normalizer\old
npm install
npm run build
```

### Ошибка pip

```cmd
cd Normalizer\backend
pip install -r requirements.txt
```

---

## Требования к VPS (для production)

| Параметр | Минимум | Рекомендуется |
|----------|---------|---------------|
| CPU | 1 ядро | 2 ядра |
| RAM | 2 GB | 4 GB |
| Диск | 20 GB SSD | 50 GB SSD |
| ОС | Ubuntu/Debian | - |