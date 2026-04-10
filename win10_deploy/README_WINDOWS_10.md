# Настройка Normalizer на Windows 10

**Полное руководство по развертыванию приложения с GitHub**

---

## 📋 Требования

- Windows 10 (версия 1809 или выше)
- Права администратора
- Интернет-соединение
- GitHub аккаунт (опционально, для fork)

---

## 🚀 Быстрый старт

### Шаг 1: Автоматическая настройка

Откройте PowerShell от имени администратора и выполните:

```powershell
# Разрешить выполнение скриптов
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

# Скачать и запустить скрипт настройки
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Den-Snaker/Normalizer/main/setup.ps1" -OutFile "setup.ps1"
.\setup.ps1
```

### Шаг 2: Клонирование и деплой

```powershell
# Клонировать репозиторий
git clone https://github.com/Den-Snaker/Normalizer.git
cd Normalizer

# Настроить .env файлы
.\deploy.ps1 -Setup
```

### Шаг 3: Запуск

```powershell
.\start.ps1
```

---

## 📦 Пошаговая установка

### 1. Установка Chocolatey (пакетный менеджер)

Откройте PowerShell от имени администратора:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### 2. Установка зависимостей через Chocolatey

```powershell
# Node.js (LTS версия)
choco install nodejs-lts -y

# Python 3.11
choco install python -y

# PostgreSQL 16
choco install postgresql16 -y

# Git
choco install git -y

# Перезапустить PowerShell после установки
```

### 3. Настройка PostgreSQL

```powershell
# Запустить PostgreSQL службу
Start-Service postgresql*-x64-16

# Создать базу данных
$env:PGPASSWORD = "postgres"  # Пароль по умолчанию
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ktru
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d ktru -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### 4. Клонирование репозитория

```powershell
# Создать директорию проекта
New-Item -ItemType Directory -Path "C:\Projects" -Force
Set-Location "C:\Projects"

# Клонировать
git clone https://github.com/Den-Snaker/Normalizer.git
cd Normalizer
```

### 5. Установка зависимостей

```powershell
# Frontend зависимости
cd frontend
npm install
cd ..

# Backend зависимости
cd backend
pip install -r requirements.txt
python -m pip install python-multipart
cd ..
```

### 6. Создание .env файлов

**Frontend: `.env.local`**

```powershell
# Создать .env.local для фронтенда
$envContent = @"
# Google Gemini API Key (получить на https://makersuite.google.com/app/apikey)
VITE_GOOGLE_API_KEY=ВАШ_GOOGLE_API_KEY

# OpenRouter API Key (получить на https://openrouter.ai/keys)
VITE_OPENROUTER_API_KEY=ВАШ_OPENROUTER_API_KEY

# Backend URL
VITE_API_URL=http://localhost:8000
"@

Set-Content -Path "frontend\.env.local" -Value $envContent -Encoding UTF8
```

**Backend: `.env`**

```powershell
# Создать .env для бэкенда
$envContent = @"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ktru
"@

Set-Content -Path "backend\.env" -Value $envContent -Encoding UTF8
```

### 7. Создание таблиц базы данных

```powershell
cd backend
python -c "from database import engine; from main import Base; Base.metadata.create_all(bind=engine)"
cd ..
```

---

## 🎮 Управление приложением

### Запуск серверов

```powershell
# Запустить frontend и backend
.\start.ps1

# Или вручную:
# Frontend (в одном терминале)
cd frontend
npm run dev

# Backend (в другом терминале)
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Остановка серверов

```powershell
.\stop.ps1
```

### Обновление из GitHub

```powershell
.\update.ps1
```

### Проверка статуса

```powershell
.\status.ps1
```

---

## 🌐 Доступ к приложению

После запуска:

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **Backend Health:** http://localhost:8000/health
- **API Documentation:** http://localhost:8000/docs

---

## 🔧 Устранение неполадок

### Проблема: PostgreSQL не запускается

```powershell
# Проверить статус службы
Get-Service postgresql*

# Запустить службу
Start-Service postgresql*-x64-16

# Если ошибка - проверить логи
Get-Content "C:\Program Files\PostgreSQL\16\data\log\*.log" -Tail 50
```

### Проблема: Порт 3000 занят

```powershell
# Найти процесс на порту 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

### Проблема: Порт 8000 занят

```powershell
# Найти процесс на порту 8000
Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force
```

### Проблема: npm install завершается с ошибкой

```powershell
# Очистить кэш npm
npm cache clean --force

# Удалить node_modules
Remove-Item -Recurse -Force frontend\node_modules

# Переустановить
cd frontend
npm install
```

### Проблема: Python зависимости не устанавливаются

```powershell
# Обновить pip
python -m pip install --upgrade pip

# Установить зависимости
cd backend
pip install -r requirements.txt --no-cache-dir
```

---

## 📝 Ручное управление

### Запуск только Frontend

```powershell
cd frontend
npm run dev
```

### Запуск только Backend

```powershell
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Запуск тестов Frontend

```powershell
cd frontend
npm run test
```

### Запуск тестов Backend

```powershell
cd backend
pytest test_schemas.py -v
```

---

## 🔐 Настройка API ключей

### Google Gemini API

1. Перейдите на https://makersuite.google.com/app/apikey
2. Создайте API ключ
3. Скопируйте ключ в `frontend\.env.local`:
   ```
   VITE_GOOGLE_API_KEY=ВАШ_КЛЮЧ
   ```

### OpenRouter API

1. Перейдите на https://openrouter.ai/keys
2. Создайте API ключ
3. Скопируйте ключ в `frontend\.env.local`:
   ```
   VITE_OPENROUTER_API_KEY=ВАШ_КЛЮЧ
   ```

### Ollama (локальный)

1. Установите Ollama: https://ollama.ai/download
2. Скачайте модель:
   ```powershell
   ollama pull qwen3.5
   ```
3. Запустите Ollama сервер (автоматически на порту 11434)

---

## 📊 Мониторинг

### Просмотр логов Backend

```powershell
# Если запущен через start.ps1
Get-Content "logs\backend.log" -Tail 50 -Wait
```

### Просмотр логов Frontend

```powershell
# Если запущен через start.ps1
Get-Content "logs\frontend.log" -Tail 50 -Wait
```

### Проверка использования памяти

```powershell
# Node.js процесс
Get-Process node | Select-Object Name, Id, CPU, WorkingSet64

# Python процесс
Get-Process python | Select-Object Name, Id, CPU, WorkingSet64
```

---

## 🔄 Обновление

### Полное обновление из GitHub

```powershell
# Остановить серверы
.\stop.ps1

# Сохранить локальные изменения .env файлов
Copy-Item "frontend\.env.local" "frontend\.env.local.backup"
Copy-Item "backend\.env" "backend\.env.backup"

# Получить обновления
git fetch origin
git reset --hard origin/main

# Восстановить .env файлы
Move-Item "frontend\.env.local.backup" "frontend\.env.local" -Force
Move-Item "backend\.env.backup" "backend\.env" -Force

# Обновить зависимости
cd frontend
npm install
cd ..
cd backend
pip install -r requirements.txt
cd ..

# Запустить серверы
.\start.ps1
```

---

## 🗑️ Удаление

### Полное удаление приложения

```powershell
# Остановить серверы
.\stop.ps1

# Удалить базу данных
& "C:\Program Files\PostgreSQL\16\bin\dropdb.exe" -U postgres ktru

# Удалить директорию проекта
Set-Location C:\
Remove-Item -Recurse -Force "C:\Projects\Normalizer"

# Опционально: удалить зависимости
# choco uninstall nodejs-lts
# choco uninstall python
# choco uninstall postgresql16
# choco uninstall git
```

---

## 📚 Дополнительные ресурсы

- **Репозиторий:** https://github.com/Den-Snaker/Normalizer
- **Продакшн:** http://94.103.92.204/
- **Документация:** `Описание функционала.docx`
- **Установка Ubuntu:** `README_LINUX.md`
- **Установка Windows:** `README_INSTALL.md`

---

## 💡 Советы

1. **Автозапуск:** Создайте ярлык `start.ps1` в папке автозагрузки
2. **Горячие клавиши:** Настройте в терминале горячие клавиши для быстрых команд
3. **Резервное копирование:** Регулярно создавайте резервные копии базы данных
4. **Мониторинг:** Отслеживайте использование памяти при работе с большими файлами

---

**Создано:** 2026-04-02  
**Обновлено:** 2026-04-02