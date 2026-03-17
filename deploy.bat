@echo off
REM обновляем образы, если есть
docker-compose pull 2>nul || 

docker-compose build

docker-compose up -d --force-recreate
