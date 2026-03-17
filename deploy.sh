#!/bin/sh
set -e

# обновляем образы, если есть
if docker-compose pull; then
  :
fi

docker-compose build

docker-compose up -d --force-recreate
