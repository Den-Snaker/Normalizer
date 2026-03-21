# Normalizer — Нормализатор заказов по КТРУ

Система автоматической нормализации заказов ИТ-оборудования по каталогу товаров, работ и услуг (КТРУ).

## Технологии

- **Backend**: Python 3.12 + FastAPI + SQLAlchemy + PostgreSQL 15
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS
- **AI**: Google Gemini / OpenRouter / Ollama (на выбор)

## Установка на новый ноутбук

### Предварительные требования

1. **Node.js 20.x LTS** — https://nodejs.org/
2. **Python 3.12** — https://www.python.org/downloads/
3. **PostgreSQL 15** — https://www.postgresql.org/download/windows/

### Шаг 1: Клонирование

```powershell
git clone https://github.com/Den-Snaker/Normalizer.git
cd Normalizer
```

### Шаг 2: Настройка базы данных

```powershell
# Войдите в PostgreSQL
psql -U postgres

# Выполните команды
CREATE DATABASE ktru;
CREATE USER ktru WITH PASSWORD 'ktru2024';
GRANT ALL PRIVILEGES ON DATABASE ktru TO ktru;
\q
```

### Шаг 3: Настройка окружения

```powershell
# Создайте .env файл
copy .env.example .env

# Отредактируйте .env, указав API ключ
notepad .env
```

Для получения ключа Gemini: https://aistudio.google.com/apikey

### Шаг 4: Установка зависимостей

```powershell
# Backend
python -m venv venv
.\venv\Scripts\activate
pip install -r backend/requirements.txt

# Frontend
cd frontend
npm install
cd ..
```

### Шаг 5: Запуск

```powershell
# Запуск backend (в одном терминале)
Restart_backend.bat

# Запуск frontend (в другом терминале)
cd old
npm run dev
```

Приложение будет доступно:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## Обновление

```powershell
git pull origin main
.\venv\Scripts\activate
pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
```

## Структура проекта

```
Normalizer/
├── backend/              # FastAPI backend
│   ├── main.py          # Основное приложение
│   ├── models.py        # Модели SQLAlchemy
│   ├── database.py      # Подключение к БД
│   ├── services/        # Бизнес-логика
│   │   ├── gemini.py   # AI сервис
│   │   ├── parsers.py  # Парсинг файлов
│   │   ├── excel.py    # Экспорт в Excel
│   │   └── ktru_parser.py  # Парсер КТРУ
│   └── requirements.txt
├── frontend/             # React frontend
│   ├── App.tsx          # Главный компонент
│   ├── services/
│   │   ├── gemini.ts   # AI клиент
│   │   ├── db.ts       # База данных
│   │   └── excel.ts    # Экспорт Excel
│   └── package.json
├── .env.example         # Шаблон настроек
├── Restart_backend.bat  # Скрипт запуска
└── README.md
```

## Функционал

### Обработка документов
- Загрузка файлов: PDF, DOCX, XLSX, MSG, изображения
- AI-извлечение данных заказа
- Автоматическое определение категории и КТРУ

### Справочник КТРУ
- Управление характеристиками по категориям
- Импорт/экспорт в Excel
- Сканирование кодов КТРУ с сайта zakupki.gov.ru
- Конвертация единиц измерения (ТБ→ГБ, МГц→ГГц)

### История заказов
- Просмотр и поиск обработанных заказов
- Экспорт в Excel

## Категории оборудования

- Серверы
- ПК
- Мониторы
- Моноблоки
- Ноутбуки
- Планшеты
- МФУ
- Принтеры
- Клавиатуры, Мыши
- Маршрутизаторы, Коммутаторы
- ИБП

## API Endpoints

### Backend
- `GET /health` — проверка соединения
- `POST /upload` — загрузка файла
- `GET /orders` — список заказов
- `GET /ktru/scan` — сканирование кодов КТРУ

## Лицензия

MIT License