# Deployment — local + Cloudflare Tunnel (apice.example.com)

Arquitectura de producción inicial: todo el stack corre en la máquina local;
`cloudflared` expone los servicios públicamente sin abrir puertos. Caddy solo
se usa como fallback (`--profile direct-origin`).

```
Learners/instructores
        │
   Cloudflare edge (TLS + CDN en vod.)
        │  cloudflared (outbound-only)
        ▼
┌─ Máquina local (docker compose prod) ─────────────────────────┐
│  api.apice.example.com   → server:8000      (API + OAuth)          │
│  admin.apice.example.com → admin:3000       (panel instructor)     │
│  vod.apice.example.com   → streamplace:38080 (HLS + transcode)     │
│  postgres · redis · seaweedfs · indexer · backups              │
└────────────────────────────────────────────────────────────────┘
```

---

## 1. DNS (una sola vez)

1. Cloudflare → Add site `apice.example.com` (Full, plan Free).
2. En Porkbun → `apice.example.com` → nameservers → los 2 de Cloudflare.
3. Esperar zona **Active** (botón "Check nameservers").

## 2. Tunnel

1. `brew install cloudflared` (o el compose ya lo corre como contenedor — solo
   necesitas el token de un tunnel creado en el dashboard).
2. Cloudflare Zero Trust → Networks → Tunnels → **Create tunnel** →
   Cloudflared → nombre `apice`.
3. Copiar el token (dashboard o `cloudflared tunnel token apice`).
4. **Public Hostnames** (crear 3):

   | Subdomain | Domain | Service |
   |---|---|---|
   | `api` | `apice.example.com` | `http://server:8000` |
   | `admin` | `apice.example.com` | `http://admin:3000` |
   | `vod` | `apice.example.com` | `http://streamplace-node:38080` |

5. `CLOUDFLARE_TUNNEL_TOKEN=...` en `server/.env` (o `.env` de la raíz para
   compose).

## 3. Configuración

1. `cp server/.env.production.example server/.env` y rellenar secretos
   (JWT, Postgres, Cloudinary, SMTP, PDS, Seaweed, `STREAMPLACE_ALLOWED_STREAMS`).
2. `admin/.env`: `NEXT_PUBLIC_SERVER_URI=https://api.apice.example.com/api/v1`,
   `NEXT_PUBLIC_STREAMPLACE_NODE_URL=https://vod.apice.example.com`,
   `NEXT_PUBLIC_ADMIN_URL=https://admin.apice.example.com`.
3. Mobile (`packages/mobile-app/.env`): `EXPO_PUBLIC_API_URL=https://api.apice.example.com`.

## 4. Levantar el stack

```bash
# Stack completo incl. tunnel:
docker compose -f docker-compose.prod.yml --profile tunnel up -d --build
# (sin tunnel: omite --profile tunnel)

docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f cloudflared
```

El server corre `prisma migrate deploy` al arrancar (schema al día).

## 5. Verificación

- [ ] `curl https://api.apice.example.com/test` → `{"succcess":true,...}`
- [ ] `curl https://api.apice.example.com/api/v1/auth/atproto/client-metadata.json` → metadata OAuth pública
- [ ] `curl https://api.apice.example.com/api/v1/network/courses` → `{"success":true,...}`
- [ ] `https://admin.apice.example.com` carga el panel
- [ ] Subir un video desde admin (dashboard Streamplace en `https://vod.apice.example.com` o upload directo)
- [ ] `pnpm smoke:video -- "at://did:web:vod.apice.example.com/place.stream.video/<rkey>"` (ver `docs/VIDEO_PIPELINE_RUNBOOK.md`)
- [ ] Indexer: `docker compose -f docker-compose.prod.yml logs indexer` → "connected"

## 6. Notas operativas

- **CDN en vod**: Cloudflare cachea segmentos HLS por defecto (extensión
  `.ts`/`.m4s` vía Page Rules si hace falta afinar).
- **Caddy**: solo con `--profile direct-origin` (puertos 80/443 abiertos y DNS
  A/AAAA a la IP de la máquina). No usar junto con el tunnel.
- **Uptime**: la máquina local es el punto único de fallo — VPS cuando el
  tráfico lo justifique (ver `docs/PRODUCTION_CHECKLIST.md`).

---

## Deploy checkout (~/apice-prod)

Deploys run from a clean checkout at an **ASCII-only path** (e.g. `~/apice-prod`).
Two reasons: Docker Compose's bake build fails on non-ASCII project paths
(gRPC header error), and deploys should never run from the live working tree.

```bash
# sync (keeps .env* files already in the deploy dir)
rsync -a --delete \
  --exclude node_modules --exclude .git --exclude .zcode \
  --exclude server/build --exclude admin/.next \
  --exclude packages/mobile-app/dist --exclude packages/mobile-app/ios \
  --exclude .expo \
  "/Users/mlv/Desktop/Home/Ápice/" /Users/mlv/apice-prod/

cd /Users/mlv/apice-prod
docker compose up -d --build     # COMPOSE_FILE is pinned in .env
./scripts/doctor.sh              # expect 12/12
```

First boot only: migrations + seeds run via the container
(`docker compose exec server sh -c "cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child scripts/seed-courses.ts"`).
