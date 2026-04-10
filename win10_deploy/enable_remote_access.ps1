# enable_remote_access.ps1 - Настройка удаленного доступа (НЕ РЕКОМЕНДУЕТСЯ)
# ВНИМАНИЕ: Это опасно! Только для продвинутых пользователей!

# ВАЖНО: Я НЕ МОГУ подключиться удаленно - это создано только для информации
# Используйте автоматические скрипты install.bat и diagnose.bat вместо этого

Write-Host "================================================" -ForegroundColor Red
Write-Host "  ВНИМАНИЕ: УДАЛЕННЫЙ ДОСТУП НЕ ТРЕБУЕТСЯ" -ForegroundColor Red
Write-Host "================================================" -ForegroundColor Red
Write-Host ""
Write-Host "Я НЕ МОГУ подключиться к вашему ноутбуку удаленно." -ForegroundColor Yellow
Write-Host ""
Write-Host "Вместо этого используйте:" -ForegroundColor Green
Write-Host "  1. install.bat - автоматическая установка" -ForegroundColor Cyan
Write-Host "  2. diagnose.bat - диагностика проблем" -ForegroundColor Cyan
Write-Host "  3. MANUAL_BACKEND_INSTALL.ps1 - ручная установка по шагам" -ForegroundColor Cyan
Write-Host ""
Write-Host "Если возникли проблемы, скопируйте сюда:" -ForegroundColor Yellow
Write-Host "  - Последние строки из консоли" -ForegroundColor Gray
Write-Host "  - Скриншот ошибки" -ForegroundColor Gray
Write-Host "  - Результат diagnose.bat" -ForegroundColor Gray
Write-Host ""

<# 
# НЕ ИСПОЛЬЗУЙТЕ ЭТО - ЭТО ТОЛЬКО ДЛЯ ИНФОРМАЦИИ

# Для включения WinRM (НЕ ВЫПОЛНЯТЬ):
Enable-PSRemoting -Force
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# Это откроет ваш компьютер для удаленных подключений
# Что очень опасно!
#>

pause