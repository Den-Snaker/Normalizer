# NORMALIZER - Установка на Ubuntu 24

## Быстрая установка

### Шаг 1: Скачать скрипт установки

```bash
# Скачать скрипт установки
wget https://github.com/Den-Snaker/Normalizer/raw/main/install.sh
chmod +x install.sh
```

### Шаг 2: Запустить установку

```bash
./install.sh
```

Скрипт автоматически:
- Установит Git, Node.js 20, Python 3
- Скачает проект с GitHub
- Установит все зависимости
- Соберёт Frontend
- Создаст скрипты управления

### Шаг 3: Настроить API ключи

```bash
nano ~/Normalizer/old/.env.local
```

Добавьте ваши ключи:
```
VITE_GEMINI_API_KEY=ваш_ключ
VITE_OPENROUTER_API_KEY=ваш_ключ
VITE_API_URL=http://localhost:8000
```

### Шаг 4: Запустить

```bash
cd ~/Normalizer
./start.sh
```

Откройте браузер: http://localhost:3000/

---

## Установка как Systemd Service (автозапуск)

Если хотите запускать Normalizer автоматически при загрузке системы:

```bash
cd ~/Normalizer
./install-service.sh
```

Это создаст systemd сервисы:
- `normalizer-backend` - Backend API (порт 8000)
- `normalizer-frontend` - Frontend (порт 3000)

**Команды управления:**

```bash
# Запуск
sudo systemctl start normalizer-backend
sudo systemctl start normalizer-frontend

# Остановка
sudo systemctl stop normalizer-backend
sudo systemctl stop normalizer-frontend

# Перезапуск
sudo systemctl restart normalizer-backend
sudo systemctl restart normalizer-frontend

# Статус
sudo systemctl status normalizer-backend
sudo systemctl status normalizer-frontend

# Логи
sudo journalctl -u normalizer-backend -f
sudo journalctl -u normalizer-frontend -f
```

---

## Управление

### Скрипты в папке Normalizer/

| Скрипт | Описание |
|--------|----------|
| `start.sh` | Запуск серверов |
| `stop.sh` | Остановка серверов |
| `restart.sh` | Перезапуск серверов |
| `status.sh` | Проверка статуса |
| `update.sh` | Обновление с GitHub |
| `servers.sh` | Интерактивное меню |
| `install-service.sh` | Установка как systemd service |

### Интерактивное меню

```bash
./servers.sh start    # Запуск
./servers.sh stop     # Остановка
./servers.sh restart  # Перезапуск
./servers.sh status    # Статус
./servers.sh logs      # Логи
```

---

## Обновление

```bash
cd ~/Normalizer
./update.sh
```

Что делает `update.sh`:
1. Останавливает серверы
2. Скачивает изменения с GitHub
3. Обновляет зависимости backend (pip)
4. Обновляет зависимости frontend (npm)
5. Собирает frontend заново

---

## Требования

| Параметр | Минимум | Рекомендуется |
|----------|---------|---------------|
| ОС | Ubuntu 20.04+ | Ubuntu 24.04 |
| CPU | 1 ядро | 2 ядра |
| RAM | 2 GB | 4 GB |
| Диск | 10 GB | 20 GB SSD |

---

## Production на VPS

### Установка

```bash
# 1. Обновить систему
sudo apt update && sudo apt upgrade -y

# 2. Скачать и запустить установку
wget https://github.com/Den-Snaker/Normalizer/raw/main/install.sh
chmod +x install.sh
./install.sh

# 3. Настроить API ключи
nano ~/Normalizer/old/.env.local

# 4. Установить как сервис
cd ~/Normalizer
./install-service.sh

# 5. Проверить статус
sudo systemctl status normalizer-frontend
sudo systemctl status normalizer-backend
```

### Открыть порты (если используется firewall)

```bash
sudo ufw allow 3000/tcp   # Frontend
sudo ufw allow 8000/tcp   # Backend API
# Или только порт 80 с nginx прокси
sudo ufw allow 80/tcp
```

### Nginx прокси (опционально)

```bash
sudo apt install nginx -y
```

Создайте `/etc/nginx/sites-available/normalizer`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/normalizer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Устранение проблем

### Порт занят

```bash
# Проверить что использует порт
sudo lsof -i :8000
sudo lsof -i :3000

# Убить процесс
kill -9 <PID>
```

### Ошибки зависимостей

```bash
# Переустановить backend
cd ~/Normalizer/backend
source venv/bin/activate
pip install -r requirements.txt

# Переустановить frontend
cd ~/Normalizer/old
rm -rf node_modules
npm install
npm run build
```

### Логи

```bash
# Для systemd сервисов
sudo journalctl -u normalizer-backend -f
sudo journalctl -u normalizer-frontend -f

# Для обычного запуска
tail -f ~/Normalizer/logs/backend.log
tail -f ~/Normalizer/logs/frontend.log
```