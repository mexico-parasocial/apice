# Pasos finales a producción (infraestructura & lanzamiento)

Checklist operativo para llevar Ápice a producción. Para gaps de **calidad de
producto**, ver la conversación de planificación (sprint de calidad).

---

## A. Código / configuración (hacer antes del deploy)

1. ~~**`/health` y `/ready`** en el server~~ — ✅ **hecho (2026-08-19)**.
   `/health` es *liveness* (no toca dependencias, para no provocar bucles de
   reinicio ante un parpadeo de la base); `/ready` es *readiness*: consulta
   Postgres y Redis con timeout de 2 s y responde **503** indicando *cuál*
   falló. El servicio `server` ya tiene `healthcheck` contra `/ready` en
   `docker-compose.prod.yml`, y Caddy espera `service_healthy` antes de
   enrutar. Probado tumbando Postgres a propósito.
2. **Logging estructurado (Pino)** en puntos críticos: auth, playback,
   credenciales, indexer, errores no capturados.
3. **Timeouts/retry** en llamadas salientes: Stripe, PDS, iM8 (Streamplace XRPC
   ya tiene timeout de 15s).
4. ✅ **Validación de entorno al arrancar (2026-08-19)** — `server/utils/env.ts`
   valida `process.env` antes de que nada escuche en un puerto y **aborta el
   arranque** con la lista de lo que falta. En producción además rechaza
   secretos que sigan en `change-me` y `ALLOW_DIRECT_VIDEO_URLS=true`.
   Un contenedor mal configurado ahora falla el despliegue en vez de arrancar
   y servir errores.

   **`.env.production.example`** con todo lo requerido:
   - `API_PUBLIC_URL` (**crítico**: sin esto el OAuth de Bluesky no funciona en prod)
   - `PDS_URL`, `PDS_SERVICE_HANDLE`, `PDS_SERVICE_PASSWORD` (fallback de publicación)
   - `PUBLIC_COURSE_URL_TEMPLATE`
   - `STREAMPLACE_ALLOWED_STREAMS` (DIDs de instructores)
   - `API_PUBLIC_URL` usado por `atprotoOAuth.service.ts` (client-metadata discoverable)
5. **Caddyfile + compose final**: dominios reales (reemplazar
   `*.apice.example.com`), healthchecks y límites de recursos en todos los
   servicios.
6. **Script de load test** del path crítico (`/videos/lessons/:id/playback` +
   resolución de playlist contra el nodo).
7. **Sentry** en server + admin + mobile (cableado con DSN placeholder).
8. **Prebuild + build de Android** — hasta ahora solo iOS está verificado;
   `@bsky.app/video`, expo-keep-awake y demás módulos deben compilar en
   Android (elegible a shims como los de iOS).
9. **Runbook de despliegue** (docs/): DNS → compose up → `migrate deploy` →
   verificación → primer curso.

## B. Depende de cuentas/credenciales (humano)

1. **Dominio real** + DNS apuntando al VPS (Caddy emite TLS automático).
2. **VPS** con specs suficientes (video = ancho de banda dominante).
3. **Credenciales ATProto** de la cuenta servicio (handle + app password).
4. **EAS/Expo account + Apple Developer + Google Play** para distribución
   (TestFlight / Play internal). `eas.json` ya existe.
5. **Sentry DSN** (opcional pero recomendado).
6. **CDN delante de `vod.<dominio>`** (Cloudflare/Bunny) — caching de
   segmentos HLS y distribución geográfica.

## C. Recta final (verificación en producción)

1. **Smoke test en dispositivo real**: login Bluesky → ver lección →
   completar → `app.civic.progress` visible en el repo del learner (pds.ls).
2. **Publicar 3–5 cursos reales** desde admin con instructor DID (también
   alimenta el indexer y la demo pública).
3. **Backup drill**: restaurar Postgres desde `apice-backups` (SeaweedFS) una
   vez antes de confiar en él.
4. **Load test** del path de playback con el CDN activo.
5. **Post de lanzamiento** — borrador listo en
   `docs/COMMUNITY_ANNOUNCEMENT.md`.
6. **Retro + diseño del modelo de ingresos** (input del próximo trimestre).
