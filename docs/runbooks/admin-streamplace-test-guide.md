# Prueba del admin y publicación de video en Streamplace

Revisión: 16 de octubre de 2026. Basada en el código actual.

Actualización del piloto Spaces: la prueba real contra Streamplace v0.11.13
confirmó `401 oauth session required` al enviar una sesión Bearer del PDS.
El uploader necesita una sesión emitida por el proxy OAuth de Streamplace;
cambiar sólo el client ID o apuntar un cliente del PDS al nodo no completa
esa integración. El CLI de publicación descrito aquí tampoco constituye una
subida verificada. Ver [evidencia y bloqueo actual](VLPDS_PILOT_STATUS.md).

## Estado y límites de esta revisión

- El admin pasó `pnpm --filter admin typecheck`.
- Pasaron 37 pruebas de los controladores de video y cuestionarios. Usan
  dependencias simuladas; no demuestran una publicación real.
- Docker no estaba disponible y no había servicios escuchando en 3000, 8000
  ni 38080. No se inició infraestructura ni se publicó ningún video.
- Se reprodujo con el SDK instalado el rechazo del client ID OAuth que genera
  el admin tanto para `http://localhost:3000` como para `http://127.0.0.1:3000`.

## Bloqueos que conviene corregir antes de una prueba completa

1. **OAuth local del admin.** `streamplaceOAuth.ts` construye siempre
   `<origin>/api/oauth/client-metadata`. Para HTTP, el SDK exige el formato
   especial de client ID loopback; ambos valores locales actuales son
   rechazados. Cambiar solamente localhost por 127.0.0.1 no lo resuelve.
   Hace falta implementar el cliente loopback y su callback, o usar un entorno
   completo con admin/API/nodo accesibles mediante HTTPS. Esto bloquea
   «Conectar con Bluesky» del uploader local, no el login por correo de Ápice.
2. **Guardar la edición de un programa.** `EditCourse.tsx` carga los IDs de
   lección pero no los incluye al construir el payload de guardado.
   `syncCourseContent` elimina lecciones cuyos IDs no llegan y crea otras.
   Por las relaciones en cascada, puede perderse progreso, cuestionarios y
   otros datos asociados. Además el editor carga `links: []`, mientras que
   avanzar desde Contenido accede directamente a `links[0].title` y `.url`;
   esto puede bloquear el avance antes del guardado.
3. **Publicado pero no vinculado.** Si `publishVideo` funciona y falla la
   vinculación con Ápice, el uploader vuelve a «ready» sin conservar en pantalla
   el URI ya publicado. Reintentar puede subir y publicar otro video. Se
   necesita conservar el URI y reintentar solo la vinculación.

Hasta corregir el punto 2, usar un programa de prueba y las acciones específicas
«Vincular video ahora»/guardar cuestionario. No usar «Guardar cambios» del
programa sobre material con alumnos o progreso que se quiera conservar.

## 1. Preparar un entorno local de prueba

Todos los comandos siguientes parten de `/Users/mlv/Desktop/apice`, salvo
cuando se indique otra cosa. Usar una base de desarrollo desechable.

1. Abrir Docker Desktop y comprobar `docker info`.
2. Instalar dependencias si faltan: `pnpm install --frozen-lockfile`.
3. Crear los archivos de entorno desde sus ejemplos solamente si no existen.
   Revisar los valores, sin sobrescribir una configuración existente:

| Archivo | Variables locales |
| --- | --- |
| `server/.env` | `DATABASE_URL=postgresql://apice:apice@localhost:5434/apice_dev?schema=public`, `REDIS_URL=redis://localhost:6381`, `PORT=8000` |
| `server/.env` | `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8091` |
| `server/.env` | `SEAWEED_S3_ENDPOINT=http://localhost:8334`, `SEAWEED_ACCESS_KEY=apice-dev-access`, `SEAWEED_SECRET_KEY=apice-dev-secret`, buckets `apice-assets` y `apice-private` |
| `server/.env` | `STREAMPLACE_VOD_BASE_URL=http://127.0.0.1:38080`, `STREAMPLACE_PUBLISH_URL=http://127.0.0.1:38080` |
| `admin/.env.local` | `NEXT_PUBLIC_SERVER_URI=http://localhost:8000/api/v1`, `NEXT_PUBLIC_SOCKET_SERVER_URI=http://localhost:8000`, `NEXT_PUBLIC_STREAMPLACE_NODE_URL=http://127.0.0.1:38080`, `NEXT_PUBLIC_ADMIN_URL=http://localhost:3000` |
| `packages/mobile-app/.env` | `EXPO_PUBLIC_API_URL=http://localhost:8000` — sin `/api/v1` |

Conservar las claves JWT necesarias para el servidor. El ejemplo de entorno
del servidor repite variables de SeaweedFS y termina con una dirección interna
de Docker; dejar un único valor efectivo `http://localhost:8334` para ejecutar
la API en el host. El nodo dentro de Docker usa `http://seaweed-s3:8333`,
configurado por compose; son direcciones para procesos distintos.

No activar `ALLOW_DIRECT_VIDEO_URLS` para demostrar este pipeline: el resultado
debe ser una referencia `at://…/place.stream.video/…`, no un MP4 de `/demo-media`.

4. Iniciar infraestructura y aplicar las migraciones:

```bash
docker compose up -d postgres redis seaweed-create-buckets streamplace-node
pnpm --filter server exec prisma migrate deploy
docker compose ps
```

Esperar a que Postgres/Redis y el nodo estén disponibles. El compose local
incluye SeaweedFS, la creación de buckets y la base `apice_streamplace`.
El nodo local tiene permisos amplios de desarrollo y solo publica el puerto
38080 en loopback. En un despliegue usar los DIDs de instructores permitidos
y la configuración de producción, no esta configuración local.

5. Solo en esta base de prueba, crear las cuentas de demo:

```bash
pnpm --filter server exec ts-node-dev --transpile-only --no-notify --exit-child scripts/seed-demo-users.ts
```

Este script actualiza contraseñas, roles e identidades de las cuentas demo
si ya existen. Cuenta admin: `admin@apice.local` / `Admin1234!`.
Cuenta alumno: `demo@apice.local` / `Demo1234!`.
Sus DIDs son ficticios: sirven para inspección local, no para demostrar una
identidad verificada ni para autorizar la publicación en Streamplace. Para eso
usar una cuenta Bluesky real del instructor y, para validar identidad del alumno,
una cuenta de alumno con vinculación real.

6. Iniciar las aplicaciones en tres terminales:

```bash
pnpm dev:server
```

```bash
pnpm dev:admin
```

```bash
pnpm --filter @apice/mobile-app exec expo start --web --port 8091 --localhost
```

7. Abrir `http://localhost:8000/ready`: debe devolver `ready: true`.
   Comprobar también `http://127.0.0.1:38080/`. `/ready` verifica DB/Redis;
   no certifica que Streamplace, OAuth ni los videos funcionen.

## 2. Publicar un clip corto y conservar su AT URI

Para recorrer el pipeline local antes de corregir OAuth del admin, usar el
dashboard propio de Streamplace:

1. Preparar el clip de prueba de 8.8 MB que ya existe en el repositorio:

```bash
./scripts/prepare-lesson-video.sh server/fixtures/videos/TESTCLIP.MP4 /tmp/apice-video-qa.mp4
```

El script necesita ffmpeg/ffprobe, normaliza H.264/AAC cuando hay audio y
conserva la proporción. Para validar sonido usar un clip que tenga pista de audio.

2. Abrir `http://127.0.0.1:38080/upload`, conectar la cuenta Bluesky real del
   instructor y autorizarla. Para este dashboard local conservar exactamente
   ese origen y puerto.
3. Subir `/tmp/apice-video-qa.mp4`, poner un título identificable, por ejemplo
   «QA Ápice — video 01», y esperar a que termine el procesamiento y la publicación.
4. Copiar el URI `at://…/place.stream.video/…`. Guardarlo junto al título,
   duración, nodo usado y hora de la prueba. No copiar solo la URL del dashboard.

La alternativa de CLI con OAuth existe en
`server/scripts/publish-lesson-video-oauth.ts`; el runbook describe el consentimiento.
No usar el script antiguo de app password para el nodo que exige OAuth.

## 3. Crear el programa y vincular el video desde el admin

1. Abrir `http://localhost:3000`, entrar como admin y llegar a `/admin`.
2. Ir a «Crear programa». Usar nombre «QA Streamplace», descripción breve,
   categoría, nivel, etiquetas y una miniatura de prueba. La URL demo es opcional.
3. Avanzar por Información → Opciones → Contenido → Vista previa.
   Completar beneficio/requisito si el formulario lo solicita.
4. Crear un módulo y una lección con título, descripción, duración en segundos
   y el AT URI obtenido en el paso anterior. Completar el primer recurso/enlace:
   actualmente el formulario lo exige para avanzar. Si se conoce el URI se
   puede usar también como demo del programa para comprobar la vista previa.
5. Pulsar «Crear programa» una sola vez, esperar respuesta exitosa y reabrirlo
   desde «Programas publicados» → editar. Ya debe existir un ID real de lección.
6. En Contenido, pegar el AT URI en «Video Url» y pulsar «Vincular video ahora».
   Esta acción guarda el video de esa lección mediante su endpoint específico.
   Respuesta esperada: `success: true`. Un URI inexistente/no disponible debe
   fallar con 422 y mantener el video anterior.
7. Recargar y verificar que el URI siga guardado. No usar el guardado global
   del editor hasta resolver el problema de IDs indicado arriba.

La publicación del programa en «Atmósfera» es una operación aparte; no es
necesaria para esta prueba básica de reproducción desde el catálogo de Ápice.

## 4. Probar la subida integrada del admin

Esta sección es un caso pendiente de ejecución hasta resolver OAuth local o
disponer de un entorno HTTPS completo.

1. Abrir una lección de prueba que ya tenga ID.
2. En «Subir video nuevo», introducir el handle del instructor y pulsar
   «Conectar con Bluesky». El login admin de Ápice y este OAuth son sesiones distintas.
3. Seleccionar el MP4, escribir título y descripción, y pulsar «Subir y publicar».
4. Observar las fases: subida → procesamiento → publicación → vinculación.
5. En la pestaña Red del navegador, comprobar la cadena:
   `createUpload` → TUS → `getUploadStatus` → `publishVideo` →
   `POST /api/v1/videos/lessons/<lessonId>/videoRef`.
6. Confirmar que el URI y la duración aparezcan en la lección y sobrevivan a
   recargar. En una lección nueva sin ID, la subida solo deja el URI en el
   formulario: aún hace falta crear el programa para guardar la relación.
7. Si se publicó pero falló vincular, recuperar el URI de la respuesta de
   `publishVideo` y usar la vinculación manual. No volver a subir el archivo
   como primer intento de recuperación.

## 5. Consumir el video como alumno

1. Abrir `http://localhost:8091` en otra sesión/perfil de navegador para separar
   el alumno del admin.
2. Entrar como alumno; completar u omitir el onboarding. Para una prueba real
   de identidad, usar una cuenta con Bluesky vinculado mediante el flujo real.
3. Inscribirse gratis en «QA Streamplace» y abrir su primera lección.
4. Si falta identidad, debe aparecer la vinculación antes del video. Completarla
   y volver a reproducir. La cuenta publicadora del instructor no sustituye la
   identidad del alumno.
5. Comprobar play/pausa, imagen, sonido si el clip lo tiene y búsqueda temporal.
   La respuesta de playback debe indicar `provider: "streamplace"` y contener
   una URL HLS del nodo configurado, nunca `/demo-media`.
6. Cerrar y volver a abrir la lección para comprobar el progreso. Para probar
   reanudación desde un punto intermedio, usar además un clip de 60–90 segundos
   y verlo parcialmente durante más de 15 segundos, sin llegar al final.
7. Completar la lección y, si se añade un cuestionario mediante su guardado
   específico, responderlo y comprobar el desbloqueo de la siguiente.

Comprobación adicional de nodo/playlist:

```bash
STREAMPLACE_VOD_BASE_URL=http://127.0.0.1:38080 pnpm --filter server smoke:video 'at://DID/place.stream.video/RECORD_KEY'
```

Sustituir el ejemplo por el URI real. El smoke actual comprueba una playlist y
su primera URL sin comentarios. Si la playlist es un master, esa URL puede ser
otra playlist: no basta por sí solo para asegurar que descargó un segmento de
video. La reproducción efectiva en el cliente sigue siendo necesaria.

## 6. Lista de comprobación del admin

- [ ] Login válido/incorrecto, recarga y cierre de sesión.
- [ ] Un alumno no puede usar operaciones administrativas (403 en la API).
- [ ] Crear programa gratuito y leerlo desde el cliente de alumno.
- [ ] Subir miniatura y comprobar persistencia después de recargar.
- [ ] Reabrir programa y comprobar IDs, duración, URI y orden de lecciones.
- [ ] Vincular URI válido y rechazar uno inexistente sin sobrescribir el anterior.
- [ ] Subida integrada: consentimiento cancelado, error del nodo y reintento.
- [ ] Cuestionario de opción múltiple: guardar y recargar conservando la respuesta correcta.
- [ ] Pregunta abierta: ver la respuesta enviada por el alumno.
- [ ] Sesión vencida durante una operación: recuperación sin perder el formulario.
- [ ] Teclado, pantalla estrecha, modo claro y oscuro.
- [ ] Antes de validar edición global: corregir IDs y enlaces vacíos; después
  confirmar con pruebas que editar un título no borra progreso ni cuestionarios.

## Funciones recomendadas y orden

| Prioridad | Trabajo | Criterio de aceptación |
| --- | --- | --- |
| P0 | Corregir guardado de edición, IDs y recursos opcionales | Editar conserva IDs/progreso/cuestionarios; se puede avanzar sin enlaces |
| P0 | OAuth local válido y recuperación de sesión de API | Conectar/cancelar/reintentar en dev; tokens rotados se conservan también en las llamadas manuales |
| P0 | Recuperar una publicación parcialmente exitosa | URI visible y copiable; reintentar vincular sin subir/publicar otra vez |
| P1 | Borrador, autoguardado y aviso al salir | Recargar no pierde trabajo; un borrador incompleto no aparece como publicado |
| P1 | Biblioteca de videos y estado técnico | Reutilizar video, ver nodo/URI/duración/estado y probar reproducción real antes de asignarlo |
| P1 | Cola de subidas con cancelación y reanudación | Retomar tras desconexión o recarga; progreso por archivo, sin publicaciones duplicadas |
| P1 | Validación previa de archivo y programa | Tamaño, formato, audio/duración y campos faltantes visibles antes de publicar |
| P1 | Vista previa como alumno | Reproducir la lección, revisar orden y cuestionarios sin confundir la demo del programa con la lección |
| P1 | Unificar español/accesibilidad | Controles y mensajes operables por teclado |
| P2 | Subtítulos/transcripción y materiales accesibles | Adjuntar y editar texto/subtítulos que el alumno realmente pueda consumir |
| P2 | Historial y permisos de autoría | Saber quién cambió un programa/video y separar edición de publicación cuando haya más instructores |

Ya existen cuestionarios con preguntas abiertas y lectura de respuestas,
gestión de usuarios/equipo, revisión INE y analítica. Conviene consolidar esas
funciones antes de abrir nuevos módulos de personalización.
