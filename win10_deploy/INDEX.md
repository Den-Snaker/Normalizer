# Деплой Normalizer на Windows 10

**Полный набор скриптов и документации для развертывания из GitHub**

---

## 📦 Содержимое папки

### Документация

| Файл | Описание | Размер |
|------|----------|--------|
| **README_WINDOWS_10.md** | Полное пошаговое руководство | 11 KB |
| **README_QUICK_START_WINDOWS.md** | Краткая шпаргалка с командами | 6.4 KB |
| **INDEX.md** | Этот файл - обзор всех скриптов | - |

### Скрипты PowerShell

| Скрипт | Назначение | Размер |
|--------|------------|---------|
| **setup.ps1** | Автоматическая настройка с нуля | 20 KB |
| **deploy.ps1** | Развертывание из GitHub | 12 KB |
| **start.ps1** | Запуск Frontend + Backend | 4.9 KB |
| **stop.ps1** | Остановка всех серверов | 3.6 KB |
| **status.ps1** | Проверка статуса и здоровья | 5.3 KB |
| **update.ps1** | Обновление из GitHub | 8.7 KB |

---

## 🚀 Быстрый старт (пошагово)

### Вариант 1: Автоматическая настройка (рекомендуется)

```powershell
# 1. Открыть PowerShell от имени администратора
# 2. Разрешить выполнение скриптов
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

# 3. Перейти в папку со скриптами
cd D:\Opencode\OpenCode_models\Normalize\win10_deploy

# 4. Запустить автоматическую настройку
.\setup.ps1
```

**setup.ps1 автоматически:**
- ✅ Установит Chocolatey
- ✅ Установит Node.js, Python, PostgreSQL, Git
- ✅ Склонирует репозиторий
- ✅ Установит зависимости
- ✅ Создаст .env файлы
- ✅ Настроит базу данных
- ✅ Создаст скрипты управления

### Вариант 2: Ручная установка

```powershell
# 1. Установка Chocolatey
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# 2. Установка зависимостей
choco install nodejs-lts python postgresql16 git -y

# 3. Клонирование
git clone https://github.com/Den-Snaker/Normalizer.git
cd Normalizer

# 4. Развертывание
.\win10_deploy\deploy.ps1 -Setup
```

---

## 🎮 Команды управления

После настройки используйте эти команды из корня проекта:

### Запуск серверов
```powershell
.\win10_deploy\start.ps1
```
- Запускает Frontend на http://localhost:3000
- Запускает Backend на http://localhost:8000
- Проверяет порты перед запуском
- Создает директорию logs/

### Остановка серверов
```powershell
.\win10_deploy\stop.ps1
```
- Останавливает все процессы на портах 3000 и 8000
- Очищает зависшие процессы
- Проверяет что порты освобождены

### Проверка статуса
```powershell
.\win10_deploy\status.ps1
```
- Показывает состояние Frontend, Backend, PostgreSQL
- Проверяет HTTP ответы
- Показывает использование памяти и CPU
- Выводит URL приложения

### Обновление из GitHub
```powershell
.\win10_deploy\update.ps1
```
- Сохраняет .env файлы
- Скачивает обновления
- Восстанавливает .env файлы
- Обновляет зависимости

### Полное развертывание
```powershell
.\win10_deploy\deploy.ps1
```
- Проверяет окружение
- Устанавливает зависимости
- Настраивает базу данных
- Создает скрипты управления

### Начальная настройка
```powershell
.\win10_deploy\deploy.ps1 -Setup
```
- Запускает setup.ps1 с параметрами по умолчанию

---

## 📂 Структура после настройки

```
C:\Projects\Normalizer\
├── frontend\              # React + Vite
│   ├── node_modules\     # Зависимости npm
│   ├── .env.local        # API ключи (ВАЖНО!)
│   └── package.json
├── backend\               # FastAPI + Python
│   ├── venv\             # Виртуальное окружение (опц.)
│   ├── .env              # База данных
│   └── requirements.txt
├── win10_deploy\         # Скрипты для Windows 10
│   ├── start.ps1
│   ├── stop.ps1
│   ├── status.ps1
│   ├── update.ps1
│   ├── deploy.ps1
│   ├── setup.ps1
│   ├── README_WINDOWS_10.md
│   └── README_QUICK_START_WINDOWS.md
├── logs\                 # Логи (создается при запуске)
│   ├── frontend.log
│   └── backend.log
└── start.ps1             # Ссылка на win10_deploy\start.ps1
```

---

## ⚙️ Конфигурация

### .env.local (Frontend)

Создайте файл `frontend\.env.local`:

```env
# Google Gemini API Key
VITE_GOOGLE_API_KEY=ВАШ_КЛЮЧ_GOOGLE

# OpenRouter API Key
VITE_OPENROUTER_API_KEY=ВАШ_КЛЮЧ_OPENROUTER

# Backend URL
VITE_API_URL=http://localhost:8000
```

**Получить ключи:**
- Google: https://makersuite.google.com/app/apikey
- OpenRouter: https://openrouter.ai/keys

### .env (Backend)

Создайте файл `backend\.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ktru
```

---

## 🌐 URL приложения

| Сервис | URL | Описание |
|--------|-----|----------|
| Frontend | http://localhost:3000 | React приложение |
| Backend | http://localhost:8000 | FastAPI сервер |
| Health | http://localhost:8000/health | Проверка здоровья |
| API Docs | http://localhost:8000/docs | Swagger документация |
| PostgreSQL | localhost:5432 | База данных |

---

## 📊 Порты

| Порт | Сервис | Примечание |
|------|---------|-------------|
| 3000 | Frontend | Vite dev server |
| 8000 | Backend | FastAPI/Uvicorn |
| 5432 | PostgreSQL | База данных |
| 11434 | Ollama (опц.) | Локальные модели |

---

## 🔧 Устранение проблем

### Проблема: Порт занят

```powershell
# Проверить порт 3000
Get-NetTCPConnection -LocalPort 3000

# Убить процесс
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Или остановить все
.\stop.ps1
```

### Проблема: PostgreSQL не запускается

```powershell
# Проверить статус
Get-Service postgresql*

# Запустить
Start-Service postgresql*-x64-16

# Перезапустить
Restart-Service postgresql*-x64-16
```

### Проблема: Зависимости не устанавливаются

```powershell
# Frontend
cd frontend
npm cache clean --force
Remove-Item node_modules -Recurse -Force
npm install

# Backend
cd backend
pip install --upgrade pip
pip install -r requirements.txt --no-cache-dir
```

### Проблема: Ошибки при запуске

```powershell
# Полный сброс
.\stop.ps1
cd frontend
npm cache clean --force
cd ..\backend
pip install -r requirements.txt --force-reinstall
cd ..
.\start.ps1
```

---

## 🔄 Обновление

### Быстрое обновление

```powershell
.\update.ps1
```

### Принудительное обновление

```powershell
.\update.ps1 -Force
```

### Ручное обновление

```powershell
git fetch origin
git reset --hard origin/main
cd frontend
npm install
cd ..\backend
pip install -r requirements.txt
cd ..
```

---

## 🗑️ Удаление

### Остановка серверов

```powershell
.\stop.ps1
```

### Удаление базы данных

```powershell
$env:PGPASSWORD = "postgres"
& "C:\Program Files\PostgreSQL\16\bin\dropdb.exe" -U postgres ktru
```

### Удаление проекта

```powershell
cd C:\
Remove-Item Projects\Normalizer -Recurse -Force
```

### Удаление зависимостей (опционально)

```powershell
choco uninstall nodejs-lts python postgresql16 git -y
```

---

## 📚 Дополнительная документация

- **README_WINDOWS_10.md** - Полное руководство (11 KB)
- **README_QUICK_START_WINDOWS.md** - Краткая шпаргалка (6.4 KB)
- **../README.md** - Основная документация проекта
- **../README_INSTALL.md** - Установка на Windows
- **../README_LINUX.md** - Установка на Ubuntu

---

## 💡 Советы

1. **Автозапуск при входе:**
   - Создайте ярлык `start.ps1`
   - Поместите в папку автозагрузки: `shell:startup`

2. **Резервное копирование:**
   ```powershell
   # База данных
   $env:PGPASSWORD = "postgres"
   & "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres ktru > backup.sql
   
   # .env файлы
   Copy-Item frontend\.env.local backup\.env.local.frontend
   Copy-Item backend\.env backup\.env.backend
   ```

3. **Логи:**
   ```powershell
   # Просмотр логов
   Get-Content logs\frontend.log -Tail 50 -Wait
   Get-Content logs\backend.log -Tail 50 -Wait
   ```

---

## 🆘 Поддержка

**Проблемы:**
1. Проверьте статус: `.\status.ps1`
2. Перезапустите серверы: `.\stop.ps1` → `.\start.ps1`
3. Обновите зависимости: `.\update.ps1`
4. Полный сброс: `.\deploy.ps1 -Setup -Force`

**Логи:**
- Frontend: `logs\frontend.log`
- Backend: `logs\backend.log`

**Документация:**
- Полное руководство: `README_WINDOWS_10.md`
- Шпаргалка: `README_QUICK_START_WINDOWS.md`

---

**Версия:** 1.0  
**Дата создания:** 2026-04-02  
**Репозиторий:** https://github.com/Den-Snaker/Normalizer