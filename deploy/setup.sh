#!/bin/bash
# Скрипт первичной настройки сервера для nekrasov11.ru
# Запускать на VPS от root

set -e

DOMAIN="nekrasov11.ru"
APP_DIR="/var/www/$DOMAIN"
REPO_URL="git@github.com:YOUR_USERNAME/nekrasov11-site.git"  # <-- заменить на свой

echo "=== Установка зависимостей ==="
apt update && apt install -y nginx python3 python3-pip git curl

# Установка Node.js через nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install --lts

echo "=== Клонирование репозитория ==="
mkdir -p /var/www
git clone $REPO_URL $APP_DIR
cd $APP_DIR

echo "=== Сборка фронтенда ==="
npm install
npm run build

echo "=== Установка Python-зависимостей ==="
pip3 install garminconnect

echo "=== Настройка nginx ==="
cp deploy/nginx.conf /etc/nginx/sites-available/$DOMAIN
ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== Настройка cron (обновление данных каждый день в 6:00) ==="
CRON_CMD="cd $APP_DIR && python3 scripts/garmin_fetch.py >> /var/log/garmin_fetch.log 2>&1"
(crontab -l 2>/dev/null; echo "0 6 * * * $CRON_CMD") | crontab -

echo ""
echo "=== Готово! ==="
echo "1. Настрой DNS: A-запись $DOMAIN -> IP этого сервера"
echo "2. Запусти garmin_fetch.py вручную для первой авторизации:"
echo "   cd $APP_DIR && python3 scripts/garmin_fetch.py"
echo "3. Для HTTPS установи certbot:"
echo "   apt install certbot python3-certbot-nginx"
echo "   certbot --nginx -d $DOMAIN -d www.$DOMAIN"
