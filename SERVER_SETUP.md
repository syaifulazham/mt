# Server Setup — dev.techlympics.my


## Nginx

Config file: `/etc/nginx/sites-available/mt`
Symlinked to: `/etc/nginx/sites-enabled/mt`

The deployment workflow generates a plain HTTP config and copies it to the server on every deploy. Certbot is then run immediately after to re-apply SSL — this ensures HTTPS is never lost after a deployment.

**Final config after certbot (what should be on the server):**

```nginx
server {
    server_name dev.techlympics.my;

    location / {
        proxy_pass         http://127.0.0.1:3310;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    listen 443 ssl;
    ssl_certificate     /etc/letsencrypt/live/dev.techlympics.my/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dev.techlympics.my/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = dev.techlympics.my) {
        return 301 https://$host$request_uri;
    }
    listen 80;
    server_name dev.techlympics.my;
    return 404;
}
```

---

## SSL Certificate

- Provider: Let's Encrypt (Certbot)
- Cert path: `/etc/letsencrypt/live/dev.techlympics.my/`
- Auto-renewal: managed by `certbot.timer` (systemd)

To manually re-apply SSL after a config change:
```bash
certbot --nginx -d dev.techlympics.my --non-interactive --agree-tos -m mahza13@gmail.com
systemctl reload nginx
```

---

## Docker

The app runs as a Docker container mapped to port `3310` on localhost.

```
container name : mt
internal port  : 3000
external port  : 127.0.0.1:3310
env file       : /opt/mt/.env.production
restart policy : unless-stopped
```

Start/restart manually:
```bash
docker stop mt && docker rm mt
docker build -t mt:latest .
sudo mkdir -p /var/mt/uploads && sudo chown -R 1001:1001 /var/mt/uploads
docker run -d --name mt --network host --env-file .env.production --restart unless-stopped \
  -v /var/mt/uploads:/app/public/uploads mt:latest
```

---

## One-Time Post-Deploy Operations

These must be run manually on the server after the first successful deploy.
The `mt-migrator:latest` image includes `node_modules` (tsx, prisma) and the
full `prisma/` folder — no volume mounts needed.

### 1. Seed organizer accounts (SUPER_ADMIN)

```bash
docker run --rm \
  --network host \
  --env-file /opt/mt/.env.production \
  mt-migrator:latest \
  node_modules/.bin/tsx prisma/seed.ts
```

### 2. Import school data (10,599 schools from schools-export.json)

```bash
docker run --rm \
  --network host \
  --env-file /opt/mt/.env.production \
  mt-migrator:latest \
  node_modules/.bin/tsx prisma/import-schools.ts
```

Both commands are idempotent (upsert) — safe to re-run.

---

## Debugging

### View live app logs

```bash
docker logs mt -f
```

### View last 50 lines

```bash
docker logs mt --tail 50 2>&1
```

### View errors only

```bash
docker logs mt --tail 100 2>&1 | grep -i "error\|Error\|prisma\|Prisma" | head -30
```

### Confirm migration applied

```bash
docker run --rm \
  --network host \
  --env-file /opt/mt/.env.production \
  mt-migrator:latest \
  node_modules/.bin/prisma migrate status
```

### Check nginx status

```bash
sudo nginx -t
sudo systemctl status nginx
sudo tail -30 /var/log/nginx/error.log
```

---

## GitHub Actions Secrets Required

| Secret | Description |
|--------|-------------|
| `SSH_HOST` | `124.217.254.122` |
| `SSH_PORT` | `53133` |
| `SSH_USER` | `root` |
| `SSH_KEY` | SSH private key for root |
| `DOMAIN` | `dev.techlympics.my` |
| `PORT` | `3310` |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Auth.js secret |
| `AUTH_TOTP_KEY` | TOTP secret |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `CLERK_WEBHOOK_SECRET` | Clerk webhook secret |
| `NEXT_PUBLIC_APP_URL` | `https://dev.techlympics.my` |
| `RESEND_API_KEY` | Resend email API key |
| `GEMINI_API_KEY` | Gemini API key |
| `EPTIM_API_KEY` | Eptim API key |
| `EPTIM_URL` | Eptim base URL |
| `EPTIMEDU_API_KEY` | EptimEdu API key |
| `EPTIMEDU_BASE_URL` | EptimEdu base URL |
