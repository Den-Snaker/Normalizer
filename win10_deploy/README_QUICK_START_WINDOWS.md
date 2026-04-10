# БЫСТРАЯ ШПАРГАЛКА - Normalizer на Windows 10

## 🚀 Быстрый старт (одна команда)

```powershell
# Запуск от имени администратора
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Den-Snaker/Normalizer/main/setup.ps1" -OutFile "setup.ps1"
.\setup.ps1
```

---

## 📦 Ручная установка (по шагам)

### 1. Установка Chocolatey
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

### 2. Установка зависимостей
```powershell
choco install nodejs-lts python postgresql16 git -y
```

### 3. Клонирование
```powershell
git clone https://github.com/Den-Snaker/Normalizer.git
cd Normalizer
```

### 4. Настройка
```powershell
# Frontend
cd frontend
npm install

# Backend
cd ..\backend
pip install -r requirements.txt

# .env файлы (создать вручную)
# frontend\.env.local
# backend\.env
```

### 5. База данных
```powershell
$env:PGPASSWORD = "postgres"
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ktru
cd ..\backend
python -c "from database import engine; from main import Base; Base.metadata.create_all(bind=engine)"
```

---

## 🎮 Команды управления

### Запуск
```powershell
.\start.ps1
```

### Остановка
```powershell
.\stop.ps1
```

### Статус
```powershell
.\status.ps1
```

### Обновление из GitHub
```powershell
.\update.ps1
```

### Полное развертывание
```powershell
.\deploy.ps1
```

### Начальная настройка
```powershell
.\deploy.ps1 -Setup
```

---

## ⚙️ Ручное управление

### Запуск Frontend
```powershell
cd frontend
npm run dev
```

### Запуск Backend
```powershell
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Запуск PostgreSQL
```powershell
Start-Service postgresql*-x64-16
```

### Создание БД
```powershell
$env:PGPASSWORD = "postgres"
& "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres ktru
```

---

## 🔑 Настройка API ключей

### .env.local (Frontend)
```env
VITE_GOOGLE_API_KEY=ВАШ_КЛЮЧ_GOOGLE
VITE_OPENROUTER_API_KEY=ВАШ_КЛЮЧ_OPENROUTER
VITE_API_URL=http://localhost:8000
```

### .env (Backend)
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ktru
```

**API ключи:**
- Google: https://makersuite.google.com/app/apikey
- OpenRouter: https://openrouter.ai/keys

---

## 🔧 Устранение проблем

### Порт 3000 занят
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

### Порт 8000 занят
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force
```

### Очистка npm кэша
```powershell
cd frontend
npm cache clean --force
Remove-Item node_modules -Recurse -Force
npm install
```

### Переустановка Python зависимостей
```powershell
cd backend
pip install --upgrade pip
pip install -r requirements.txt --no-cache-dir
```

### PostgreSQL не запускается
```powershell
Start-Service postgresql*-x64-16
Get-Service postgresql*
```

---

## 🌐 URL приложения

- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:8000
- **Health check:** http://localhost:8000/health
- **API docs:** http://localhost:8000/docs

---

## 📊 Порты

| Сервис | Порт | Описание |
|--------|------|----------|
| Frontend | 3000 | React+Vite |
| Backend | 8000 | FastAPI |
| PostgreSQL | 5432 | База данных |

---

## 🧪 Тестирование

### Frontend тесты
```powershell
cd frontend
npm run test
```

### Backend тесты
```powershell
cd backend
pytest test_schemas.py -v
```

---

## 🔄 Обновление

### Быстрое обновление
```powershell
.\update.ps1
```

### Полное обновление с пересборкой
```powershell
git pull origin main
cd frontend
npm install
cd ..\backend
pip install -r requirements.txt
cd ..
.\stop.ps1
.\start.ps1
```

---

## 🗑️ Удаление

```powershell
# Остановка
.\stop.ps1

# Удаление БД
$env:PGPASSWORD = "postgres"
& "C:\Program Files\PostgreSQL\16\bin\dropdb.exe" -U postgres ktru

# Удаление проекта
cd ..
Remove-Item Normalizer -Recurse -Force
```

---

## 📝 Структура проекта

```
Normalizer/
├── frontend/           # React + Vite
│   ├── App.tsx        # Главный компонент
│   ├── services/      # API сервисы
│   ├── .env.local     # API ключи
│   └── package.json
├── backend/           # FastAPI + Python
│   ├── main.py        # API endpoints
│   ├── database.py    # PostgreSQL
│   ├── .env           # База данных
│   └── requirements.txt
├── setup.ps1          # Автонастройка
├── deploy.ps1         # Развертывание
├── start.ps1          # Запуск серверов
├── stop.ps1           # Остановка серверов
├── status.ps1         # Статус серверов
└── update.ps1         # Обновление из GitHub
```

---

## 🆘 Экстренная помощь

### Все процессы зависли
```powershell
# Убить все node процессы
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Убить все python процессы (осторожно!)
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force

# Перезапуск PostgreSQL
Restart-Service postgresql*-x64-16
```

### Полный сброс
```powershell
# Остановить все
.\stop.ps1

# Удалить зависимости
Remove-Item frontend\node_modules -Recurse -Force -ErrorAction SilentlyContinue

# Переустановить
cd frontend
npm install
cd ..

# Запустить
.\start.ps1
```

---

**Создано для Windows 10**  
**Документация:** README_WINDOWS_10.md