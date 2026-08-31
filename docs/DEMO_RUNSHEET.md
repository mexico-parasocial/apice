# Ápice — Run sheet de demo

Estado verificado el **2026-07-24**. Todo lo de abajo se probó de extremo a
extremo en local ese día.

---

## 0. Vocabulario (usar estos términos en voz alta)

| En pantalla | Antes se llamaba | Qué es |
|---|---|---|
| **Programa** | Curso | La unidad que el militante cursa de principio a fin (da certificado) |
| **Módulo** | Sección | Bloque temático dentro de un programa |
| **Lección** | Lección | La pieza individual con video / cuestionario |

> Los identificadores internos (base de datos, rutas de API como `/get-courses`)
> **todavía dicen "course"/"section"**. Es solo el nombre visible el que cambió.
> No abras DevTools ni la API en vivo.

---

## 1. Arranque (≈3 min antes)

```bash
cd /Users/mlv/Desktop/Ápice && make run-dev-env
```

Luego, en tres terminales:

```bash
pnpm dev:server
```

```bash
pnpm dev:admin
```

```bash
pnpm web -- --port 8082
```

Y deja el estado del alumno en cero:

```bash
cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child scripts/demo-reset.ts
```

### Puertos

| Servicio | URL | Nota |
|---|---|---|
| App (learner) | http://localhost:8082 | **8082, no 8081** — el 8081 lo ocupa el proyecto PARA |
| Admin | http://localhost:3000 | |
| API | http://localhost:8000 | |
| Postgres | localhost:**5434** | 5432 lo ocupa un Postgres de Homebrew; 5433 otro stack |

### Cuentas

| Rol | Email | Password |
|---|---|---|
| Alumna | `demo@apice.local` | `Demo1234!` |
| Admin | `admin@apice.local` | `Admin1234!` |

> Ambas apps entran con correo y contraseña. Ver §3 para el detalle.

---

## 2. Guion sugerido (8–10 min)

### A. Inicio y catálogo — "esto es lo que ve un militante"
1. Abre **http://localhost:8082** en ventana angosta (~400 px) para que se vea como móvil.
   El **Inicio** ya es la portada del recorrido: saludo con nombre, tarjeta
   **"Continuar aprendiendo"** con barra de progreso dorada (aparece cuando la
   alumna tiene un programa empezado — completa una lección antes de la demo
   para que se vea), sección **Programas** (troncales) y **Optativos** (círculos).
2. Pestaña **Programas** → 5 programas reales en español: dos troncales + tres optativos.
3. Señala el mix: *Fundamentos de Participación Cívica*, *Derechos y Deberes
   Ciudadanos*, y los optativos (*Conciencia de Clase*, *Derechos Laborales*,
   *Fiscalía y Acceso a la Justicia*).

### B. El camino del programa — el gancho visual (la "ruta tipo Candy Crush")
4. Abre **Fundamentos de Participación Cívica**.
5. Aparece **"Progreso del programa"**: un camino serpenteante tipo Duolingo /
   Candy Crush con las lecciones encadenadas — la primera desbloqueada, las
   siguientes con candado. Debajo de cada lección va el **módulo** al que
   pertenece. Se hace scroll dentro del camino.
6. Frase útil: *"la progresión es secuencial — no se puede saltar contenido."*

### C. Video y desbloqueo
7. Toca la primera lección → **el video se reproduce** (clip de muestra de 23 s).
   Aparece el distintivo **"Identidad verificada"**: la reproducción está
   condicionada a una identidad Bluesky verificada.
   - Arranca **silenciado** (política de autoplay del navegador). Súbele el
     volumen con los controles nativos si quieres audio.
8. Al **terminar el video la lección se completa sola** → vuelve atrás → el
   porcentaje sube a **25 %**, el nodo se pone verde y **se desbloquea la
   siguiente lección**.
   - Si prefieres no esperar, el botón **"Marcar como completada"** hace lo mismo.
9. Las lecciones siguientes muestran *"URL de reproducción no disponible"*: solo
   la primera lección de cada programa tiene video (ver §4).

### D. Certificado — el cierre
10. Para cerrar un programa completo en vivo usa **Los Derechos Laborales** (solo
    2 lecciones). Complétalas.
11. Pestaña **Profile** → notificación *"¡Programa completado!"* y el certificado
    en **Mis certificados**, con botón de descarga (SVG real).

### E. Admin — "y así lo administra el partido"
12. **http://localhost:3000** → login admin.
13. **Dashboard**: analítica de 12 meses, 64 usuarios, transacciones recientes.
14. **Users**: 64 alumnos con programas inscritos.
15. **Live Programs**: los 5 programas con ratings y nº de inscritos.
16. **INE Verifications** y **Create Program**: menciona que el partido publica
    su propio contenido y verifica identidad de sus militantes.

---

## 3. Login

La pantalla de **Perfil** ofrece dos caminos:

1. **Correo + contraseña** (el que funciona hoy, úsalo en la demo).
2. **iM8 / handle** — identidad federada. Requiere el servicio de identidad en
   `127.0.0.1:8787`, que **no está corriendo**. No lo toques en vivo.

El botón de OAuth de Bluesky se quitó: exigía una cuenta real de Bluesky y
duplicaba el camino de iM8.

### Entrar en la demo

Pestaña **Perfil** → toca **"Usar cuenta de demostración"** (rellena los campos)
→ **Entrar**. También puedes escribirlas a mano:

| Rol | Correo | Contraseña |
|---|---|---|
| Alumna (usa esta) | `demo@apice.local` | `Demo1234!` |
| Admin | `admin@apice.local` | `Admin1234!` |

**Usa la cuenta de alumna** para el recorrido: está inscrita en los 5 programas
y tiene el DID que exige el reproductor de video. El admin sirve para entrar al
panel en `localhost:3000`.

> El enlace *"Usar cuenta de demostración"* solo aparece en builds de desarrollo
> (`__DEV__`); no se compila en un release.

---

## 4. Huecos conocidos — qué decir si preguntan

| Hueco | Qué se ve | Qué decir |
|---|---|---|
| **Video simulado** | La primera lección de cada curso reproduce un clip de 23 s (`TESTCLIP.MP4`) | El clip se sirve **localmente**, no desde Streamplace. El pipeline real está construido y probado (`stream.place` responde correctamente al XRPC de playback) pero **aún no se ha publicado ningún video al nodo**. En cuanto exista la cuenta y el AT URI, se cambia con un comando (§5) sin tocar código. |
| **Duración no coincide** | La lección dice *4:00* pero el clip dura *0:23* | Es un clip de muestra; las duraciones son las del guion real del curso. |
| **Resto de lecciones sin video** | *"URL de reproducción no disponible"* | Solo se conectó la primera lección de cada programa — el resto del contenido está en producción. |
| **Analítica** | Gráficas de 12 meses con datos | Son **datos sembrados de demo**, no tráfico real. Dilo antes de que lo pregunten. |
| **Admin en inglés** | Etiquetas *Users*, *Invoices*, *Create Program* | El panel viene de una plantilla; la marca ya es Ápice pero la traducción está pendiente. |
| **Precio $199** | Un programa muestra precio | La inscripción es **gratuita por defecto** por decisión de producto; el precio es informativo. |
| **Cuestionarios** | La última lección de cada programa lleva un listón dorado (checkpoint) | **Ya funcionan de punta a punta**: ver el video y aprobar el cuestionario (70%) desbloquea lo siguiente y cierra el programa. Suspender no bloquea — se puede reintentar. Los 5 programas tienen cuestionario sembrado. |

---

## 5. Video: cómo está montado hoy y cómo se cambia

### Hoy (simulado, local)

`server/.env` lleva `ALLOW_DIRECT_VIDEO_URLS=true`. Eso habilita dos cosas
**solo para demos locales**:

- el servidor sirve `fixtures/videos/` en `/demo-media` (con byte-ranges, así
  que la barra de progreso funciona);
- `createVideoDeliveryProvider` acepta URLs `http(s)` además de AT URIs.

Sin esa variable, el único origen válido sigue siendo Streamplace — así que
esto **no puede colarse a producción por accidente**.

Para volver a conectarlo si algo se desconfigura:

```bash
cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child scripts/attach-lesson-video.ts "http://127.0.0.1:8000/demo-media/TESTCLIP.MP4" --first-only
```

Para publicar un video REAL al nodo (sin navegador) y dejar el fixture:
ver `docs/VIDEO_PIPELINE_RUNBOOK.md` §"Headless path" y
`docs/PILOT_CHECKLIST.md`. Resumen:

```bash
export ATPROTO_HANDLE="…" ATPROTO_APP_PASSWORD="…"
cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
  scripts/publish-lesson-video.ts ../lesson.mp4 --title "…" --lesson <lessonId>
```

> La reproducción exige identidad Bluesky verificada. `seed-demo-users.ts` le
> pone un `blueskyDid` de demo a `demo@apice.local`; si lo borras, el
> reproductor devuelve 403.

### Cuando llegue la cuenta de Streamplace

Publica el video al nodo, toma el AT URI (`at://did:…/place.stream.video/…`) y:

```bash
cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child scripts/attach-lesson-video.ts "at://did:…/place.stream.video/…" --first-only
```

El script **verifica que el video realmente se resuelve** contra el mismo
proveedor que usa el servidor antes de escribir en la base — si el URI está mal,
falla ahí y no en el escenario. `--first-only` lo pone en la primera lección de
cada programa; sin la bandera, en todas las lecciones sin video.

Al pasar a Streamplace, quita `ALLOW_DIRECT_VIDEO_URLS` de `server/.env`.

Comprobación independiente:

```bash
cd server && pnpm smoke:video "at://did:…/place.stream.video/…"
```

---

## 6. Si algo se cae en vivo

| Síntoma | Arreglo |
|---|---|
| La app no carga cursos | Revisa que el server siga arriba: `curl localhost:8000/api/v1/get-courses`. Si cambió el puerto del bundler, añade el origen a `ALLOWED_ORIGINS` en `server/.env` y **reinicia el server** (no recarga solo). |
| Pantalla en blanco en un curso | Recarga. Si persiste, salta a otro curso — el catálogo y el admin no dependen de esa pantalla. |
| El progreso no sube | Vuelve a entrar al curso (la pantalla refresca al recuperar el foco). |
| Postgres no conecta | El puerto es **5434**. Si algo más lo tomó, `docker compose up -d postgres` y revisa `docker ps`. |
| Todo mal | Reinicia limpio: `make run-dev-env` y vuelve a levantar los tres procesos. Los datos sembrados persisten en el volumen. |

---

## 7. Semillas disponibles

```bash
cd server
# 5 programas con módulos y lecciones
pnpm exec ts-node-dev --transpile-only --no-notify --exit-child scripts/seed-courses.ts
# cuentas demo@ y admin@ (pre-verificadas)
pnpm exec ts-node-dev --transpile-only --no-notify --exit-child scripts/seed-demo-users.ts
# 62 alumnos + inscripciones + órdenes repartidos en 12 meses (para la analítica)
pnpm exec ts-node-dev --transpile-only --no-notify --exit-child scripts/seed-demo-analytics.ts
# deja a demo@apice.local en cero, inscrita en todo
pnpm exec ts-node-dev --transpile-only --no-notify --exit-child scripts/demo-reset.ts
```

La cohorte de analítica usa el dominio `@demo.apice.local` y se borra con:

```sql
DELETE FROM "User" WHERE email LIKE '%@demo.apice.local';
```

---

## 8. Nota para iOS

El reproductor web (`packages/mobile/src/components/VideoPlayer.web.tsx`) es
nuevo: `@bsky.app/video` lanza *"Not implemented on web"*, así que la web usa un
`<video>` HTML5 con el mismo contrato de callbacks. **La app nativa sigue usando
BlueskyVideoView sin cambios** — este archivo solo afecta al build web.
