# Normalizer Project - Полный Контекст

**Последнее обновление:** 2026-03-21  
**Репозиторий:** https://github.com/Den-Snaker/Normalizer  
**Продакшн:** http://94.103.92.204/

---

## Описание Проекта

Система для OCR-распознавания и нормализации документов государственных закупок (КТРУ - Каталог товаров, работ, услуг). Позволяет извлекать структурированные данные из PDF/изображений и нормализовывать их согласно справочникам КТРУ.

### Технологический Стек

**Frontend:**
- React 19 + TypeScript
- Vite (сборка)
- Tailwind CSS (стили)
- IndexedDB (локальное хранение данных)
- Vitest (тестирование)

**Backend:**
- Python 3.11
- FastAPI (API фреймворк)
- PostgreSQL (база данных)
- Pydantic (валидация данных)
- Uvicorn (ASGI сервер)

**AI Провайдеры:**
- Google Gemini (требует API ключ)
- OpenRouter (требует API ключ)
- Ollama локальный
- Ollama Cloud (требует API ключ пользователя)

**Инфраструктура:**
- Docker + Docker Compose
- Nginx (продакшн)
- systemd (автозапуск на Linux)

---

## Структура Проекта

```
D:\Opencode\OpenCode_models\Normalize\
├── frontend\                      # Frontend (React + Vite)
│   ├── App.tsx                    # Главный UI компонент
│   ├── main.tsx                   # Точка входа
│   ├── index.html                 # HTML шаблон
│   ├── services\
│   │   ├── gemini.ts              # LLM провайдеры, API вызовы
│   │   ├── db.ts                  # IndexedDB конфигурация
│   │   └── ktru-categories.ts     # Категории КТРУ
│   ├── components\                # React компоненты
│   ├── hooks\                    # React хуки
│   ├── test\
│   │   ├── gemini.test.ts        # Тесты LLM провайдеров
│   │   └── utils.test.ts         # Тесты утилит
│   ├── vitest.config.ts          # Конфигурация тестов
│   ├── .env.local                # API ключи (НЕ для Ollama Cloud!)
│   └── .env.example              # Пример конфигурации
│
├── backend\                       # Backend (FastAPI + Python)
│   ├── main.py                    # API endpoints
│   ├── schemas.py                 # Pydantic модели
│   ├── database.py                # PostgreSQL соединение
│   ├── test_schemas.py           # Тесты схем
│   └── requirements.txt          # Python зависимости
│
├── .deploy\
│   └── opencode_demo              # SSH ключ для продакшн сервера
│
├── install.bat                    # Windows установка
├── install.sh                     # Ubuntu установка
├── start_local.bat               # Запуск серверов (Windows)
├── stop_local.bat                 # Остановка серверов (Windows)
├── restart_local.bat              # Перезапуск серверов (Windows)
├── status_local.bat               # Статус серверов (Windows)
├── servers.bat                    # Интерактивное меню (Windows)
├── run_tests.bat                  # Запуск тестов
├── README_INSTALL.md              # Инструкция для Windows
├── README_LINUX.md               # Инструкция для Ubuntu
│
├── docker-compose.yml            # Docker конфигурация
├── Dockerfile                    # Docker образ
└── CONTEXT.md                    # Этот файл
```

---

## Выполненные Работы

### 1. Исправление безопасности - Ollama Cloud API Key

**Проблема:** API ключ Ollama Cloud хранился в `.env` файлах, что могло привести к его утечке при публикации в GitHub.

**Решение:**
- Удален ключ `OLLAMA_CLOUD_API_KEY` из `.env.local` и `.env` файлов
- Frontend (`frontend/App.tsx`) теперь требует ввод ключа пользователем при выборе Ollama Cloud
- Backend (`backend/main.py`) принимает `api_key` в теле запроса, а не из переменных окружения
- Обновлены `.env.example` файлы с примечаниями о безопасности

**Изменённые файлы:**
- `frontend/App.tsx` - добавлено поле ввода API ключа для Ollama Cloud
- `frontend/services/gemini.ts` - функции `makeRequest` и `handleCheckLlm` обновлены для работы с пользовательским ключом
- `backend/main.py` - endpoint `/api/ollama-cloud/chat` требует `api_key` в запросе
- `frontend/.env.example` - добавлено примечание о безопасности
- `backend/.env.example` - убрана переменная `OLLAMA_CLOUD_API_KEY`

### 2. Улучшения UI

**Изменения:**
- Переименовано "Свой ключ" → "API ключ" для всех провайдеров (Google, OpenRouter, Ollama)
- Исправлена передача Ollama Cloud API ключа в тестовом запросе (`handleCheckLlm`)

### 3. Создание тестового набора

**Frontend тесты (47 тестов):**
- `frontend/test/gemini.test.ts` - тесты LLM провайдеров, проверка API вызовов
- `frontend/test/utils.test.ts` - тесты утилит и вспомогательных функций
- Конфигурация: `vitest.config.ts`

**Backend тесты (29 тестов):**
- `backend/test_schemas.py` - тесты Pydantic схем, валидация данных

**Запуск тестов:**
```cmd
run_tests.bat
```

### 4. Windows Batch файлы

Созданы скрипты управления серверами для Windows:

| Файл | Назначение |
|------|------------|
| `start_local.bat` | Запуск Frontend и Backend серверов |
| `stop_local.bat` | Остановка серверов |
| `restart_local.bat` | Перезапуск серверов |
| `status_local.bat` | Проверка статуса серверов |
| `servers.bat` | Интерактивное меню выбора действий |

**Особенности:**
- Используются только ASCII символы (без Unicode) для избежания проблем с кодировкой Windows
- Проверка статуса через PowerShell с паттерном `exit 0/1`
- Автоматическое определение занятости портов

### 5. Ubuntu скрипты установки

Созданы скрипты для развёртывания на Ubuntu серверах:

| Файл | Назначение |
|------|------------|
| `install.sh` | Полная автоматическая установка |
| `install-service.sh` | Установка как systemd сервисов (автозапуск) |

**Функционал install.sh:**
- Проверка зависимостей (Node.js, Python, Git)
- Клонирование репозитория
- Установка npm пакетов
- Установка Python зависимостей
- Создание окружения
- Генерация скриптов управления

**systemd сервисы:**
- `ktru-frontend.service` - Frontend сервер
- `ktru-backend.service` - Backend сервер
- Автозапуск при загрузке системы

### 6. Документация

**Обновлённые файлы:**
- `Описание функционала.docx` - добавлены разделы 7-9:
  - Раздел 7: Поддержка AI провайдеров (Google Gemini, OpenRouter, Ollama)
  - Раздел 8: Локальная разработка и тестирование
  - Раздел 9: Безопасность API ключей

- `README_INSTALL.md` - инструкция для Windows
- `README_LINUX.md` - инструкция для Ubuntu

---

## Продакшн Сервер

### SSH Доступ

```bash
ssh -i ".deploy/opencode_demo" root@94.103.92.204
```

### Деплой

```bash
cd /opt/ktru
git pull origin main
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Логи

```bash
docker-compose logs -f
```

### Перезапуск

```bash
docker-compose restart
```

---

## Локальная Разработка

### Windows

```cmd
# Запуск серверов
servers.bat          # Интерактивное меню
start_local.bat     # Прямой запуск

# Или вручную:
cd frontend
npm run dev          # Frontend (http://localhost:3000)

cd ..\backend  
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload  # Backend

# Тесты
run_tests.bat
```

### Ubuntu

```bash
cd ~/Normalizer
./servers.sh start
./update.sh  # Обновление из GitHub
```

---

## API Endpoints

### Frontend → Backend

| Endpoint | Method | Описание |
|----------|--------|----------|
| `/api/ollama-cloud/chat` | POST | Прокси для Ollama Cloud API |
| `/api/health` | GET | Проверка здоровья сервера |

### Backend → Внешние API

| Провайдер | Endpoint | Описание |
|-----------|----------|----------|
| Google Gemini | `generativelanguage.googleapis.com` | API для Gemini моделей |
| OpenRouter | `openrouter.ai/api/v1` | API для различных LLM |
| Ollama Local | `localhost:11434` | Локальный Ollama |
| Ollama Cloud | `api.olama.cloud` | Облачный Ollama |

---

## Переменные Окружения

# Frontend (.env.local)

```env
# Google Gemini API
VITE_GOOGLE_API_KEY=your_google_api_key

# OpenRouter API
VITE_OPENROUTER_API_KEY=your_openrouter_api_key

# ВАЖНО: Ollama Cloud API ключ вводится пользователем в UI
# НЕ сохраняйте его в .env файлах!
```

### Backend (.env)

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ktru

# Ollama Cloud API ключ передаётся в теле запроса
# НЕ используйте переменную окружения для этого ключа!
```

---

## Решения и Компромиссы

### 1. Безопасность Ollama Cloud API

**Решение:** API ключ вводится пользователем в UI и не сохраняется нигде.

**Обоснование:**
- Предотвращает утечку ключа при публикации кода в GitHub
- Пользователь контролирует свой ключ
- Не требует дополнительных настроек сервера

**Альтернатива (отвергнута):** Хранение ключа в `.env` с добавлением в `.gitignore` - сложнее поддерживать, риск человеческого фактора.

### 2. Фреймворк тестирования

**Решение:** Vitest для frontend, Pytest для backend.

**Обоснование:**
- Vitest нативно работает с Vite и TypeScript
- Pytest стандарт для Python
- Простая конфигурация

### 3. Batch файлы Windows

**Решение:** Использовать только ASCII символы, без Unicode/кириллицы.

**Обоснование:**
- Проблемы с кодировкой CP866/CP1251/UTF-8 в разных версиях Windows
- Вывод ошибок при использовании кириллицы в `chcp` командах
- ASCII надёжно работает везде

**Паттерн проверки статуса:**
```batch
powershell -Command "(Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200; exit $?" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Running
) else (
    echo Not running
)
```

### 4. systemd сервисы на Ubuntu

**Решение:** Создать отдельные systemd сервисы вместо Docker.

**Обоснование:**
- Docker уже используется в продакшне
- Для разработки удобнее прямое управление процессами
- Автозапуск при загрузке системы
- Простые команды: `systemctl start/stop/restart ktru-backend`

---

## Текущее Состояние

### Серверы
- ✅ Frontend: http://localhost:3000 (локально)
- ✅ Backend: http://localhost:8000 (локально)
- ✅ Продакшн: http://94.103.92.204/
- ✅ GitHub: https://github.com/Den-Snaker/Normalizer

### Тесты
- ✅ Frontend: 47 тестов
- ✅ Backend: 29 тестов
- ✅ Всего: 76 тестов
- ✅ Все проходят

### Безопасность
- ✅ Ollama Cloud API ключ удалён из `.env` файлов
- ✅ API ключи в `.env.example` не содержат реальные ключи
- ✅ `.env` файлы в `.gitignore`

---

## Известные Проблемы

На данный момент критических проблем нет.

---

## Планы на Будущее

1. Добавить интеграционные тесты для API endpoints
2. Добавить CI/CD pipeline (GitHub Actions)
3. Добавить мониторинг и логирование в продакшне
4. Оптимизировать производительность OCR для больших документов

---

## Команды для Быстрого Старт

### Локальная разработка (Windows)

```cmd
cd D:\Opencode\OpenCode_models\Normalize\frontend
npm install
npm run dev

# Во втором терминале:
cd D:\Opencode\OpenCode_models\Normalize\backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Деплой на продакшн

```cmd
# Локально:
git add -A && git commit -m "update" && git push origin main

# На сервере:
ssh -i ".deploy\opencode_demo" root@94.103.92.204
cd /opt/ktru
git pull origin main
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Тестирование

```cmd
# Windows:
run_tests.bat

# Или вручную:
cd frontend && npm test
cd ..\backend && pytest
```

---

## Контакты и Ссылки

- **Репозиторий:** https://github.com/Den-Snaker/Normalizer
- **Продакшн:** http://94.103.92.204/
- **Документация:** `Описание функционала.docx`
- **Инструкции:** `README_INSTALL.md` (Windows), `README_LINUX.md` (Ubuntu)

---

## История Изменений

| Дата | Изменение |
|------|-----------|
| 2026-03-21 | Создан файл контекста |
| 2026-03-21 | Исправлена безопасность Ollama Cloud API |
| 2026-03-21 | Добавлены тесты (76 тестов) |
| 2026-03-21 | Созданы Windows batch файлы управления |
| 2026-03-21 | Созданы Ubuntu скрипты установки |
| 2026-03-21 | Обновлена документация |

---

*Этот файл содержит полный контекст проекта Normalizer. Обновляйте его при внесении важных изменений.*