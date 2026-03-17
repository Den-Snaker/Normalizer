:: остановить все процессы backend
powershell -Command "& { Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*Normalize\\backend\\venv*' } | ForEach-Object { Stop-Process -Id $_.Id -Force } }"

:: запустить снова
powershell -Command "Start-Process -WindowStyle Hidden -FilePath 'D:\Opencode\OpenCode_models\Normalize\backend\venv\Scripts\python.exe' -ArgumentList '-m','uvicorn','main:app','--host','127.0.0.1','--port','8000','--app-dir','D:\Opencode\OpenCode_models\Normalize\backend'"
