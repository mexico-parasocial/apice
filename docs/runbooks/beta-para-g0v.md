# Beta de Ápice en para-g0v.site

Decisión del propietario (2026-10-19): Cloudflare Free delante de su Mac
actual. El dominio está en proceso de registro. No se ha publicado la app.

## Qué corre dónde

| Componente | Destino |
|---|---|
| Web y API de Ápice | Mac, un solo escritor institucional, `127.0.0.1:28010` |
| VLPDS + Spaces | Mac, `127.0.0.1:22583`, modo normal y PLC directory |
| Administración VLPDS | Sólo Mac, `127.0.0.1:22584`, fuera de Tunnel |
| Métricas VLPDS | Sólo Mac, `127.0.0.1:22585`, fuera de Tunnel |
| Objetos de la beta | MinIO privado, `127.0.0.1:22595`, volumen nuevo |
| Streamplace | Mac/Docker, SQLite, `127.0.0.1:28080`, instructores cerrados por defecto |
| DNS / HTTPS / Tunnel | Cloudflare, después del registro y autenticación local |
| Entrega pública de video | Pendiente de integrar y probar una ruta compatible |

El proyecto Compose `apice-beta` usa volúmenes separados. No importa las cuentas
de prueba, no cambia el despliegue anterior y no utiliza PostgreSQL. AWS y R2
no se activan automáticamente: el bucket AWS verificado sigue sin conectarse
a los servicios. Los objetos locales no cuentan como respaldo fuera del equipo.

La web del piloto reúne institución y alumno. El admin Next y la app Expo
anteriores aún no se han adaptado a este runtime. Esta preparación no completa
esa integración ni convierte el piloto entero en un producto publicado.

## Preparación local

Desde la raíz del proyecto:

```sh
node packages/pilot/scripts/prepare-beta.mjs
pnpm --filter @apice/pilot beta:ui
docker compose -f packages/pilot/infra/beta-compose.yaml up -d storage buckets
node packages/pilot/scripts/beta-pds.mjs
```

El preparador crea secretos diferentes con permisos 0600 en
`packages/pilot/.local/beta/secrets/`. Repetirlo conserva las claves. No
imprimirlos, compartirlos por chat ni incluirlos en Git. El cifrado KEK y la
clave PLC se deben conservar en un respaldo protegido independiente del Mac.

El anuncio automático a relays y las consultas ASN de suscriptores quedan
desactivados en esta preparación. La primera puesta en marcha probó el relay
predeterminado y recibió rechazo porque el dominio aún no era resoluble; no
había cuentas ni registros de alumnos. El arranque actual usa una lista vacía.

El PDS exige invitaciones. No se pasan `--dev-mode`, claves de fixture ni
`--plc-mode unregistered`. Las cuentas reales y el correo de recuperación se
configuran después de que el dominio sea resoluble y el PDS público esté listo.
La UI del PDS se compila desde su lockfile; el arranque exige una compilación
completa en vez de servir una página de reemplazo silenciosamente.

Las imágenes Docker predeterminadas son referencias locales por contenido,
verificadas en esta Mac ARM64. `pull_policy: never` evita sustituirlas por una
imagen descargada distinta. Otro equipo requiere reconstrucción y verificación
de sus imágenes; este archivo no es todavía un despliegue portátil certificado.

Para levantar el nodo de video únicamente en loopback:

```sh
docker compose -f packages/pilot/infra/beta-compose.yaml --profile video up -d streamplace
```

`SP_WIDE_OPEN=false` por sí solo no cierra v0.11.13: una lista de instructores
vacía permite publicar a cualquier DID válido. Por eso se usa un valor que no
coincide con ninguna cuenta hasta configurar `BETA_INSTRUCTOR_DIDS` explícitamente.

## Dominio y Cloudflare

1. Terminar el registro de `para-g0v.site`.
2. Añadirlo a Cloudflare Free y configurar los nameservers que Cloudflare
   muestre para esa zona; esperar el estado Active.
3. Autenticar `cloudflared tunnel login` en esta Mac. La autorización se
   completa en el navegador del propietario; no pasar tokens por chat.
4. Crear el túnel de Ápice y preparar la configuración privada a partir de
   `packages/pilot/infra/cloudflared-beta.yml.example`, con UUID y archivo de
   credenciales correctos. Comprobar rutas con `cloudflared ... ingress validate`.
5. Publicar sólo las rutas aprobadas para el despliegue. Nunca apuntar Tunnel
   a los puertos del piloto ni a MinIO, administración o métricas.

Hosts previstos: `para-g0v.site`, `pds.para-g0v.site`, `vod.para-g0v.site`.
La plantilla deja `vod` en 503 hasta resolver la entrega de video.

Cloudflare Free no ejecuta el binario VLPDS ni el transcodificador Streamplace.
Workers Free tiene límites de CPU/memoria y Cloudflare Containers requiere
Workers Paid. Tunnel publica servicios que siguen ejecutándose en la Mac.
Si la Mac duerme, se apaga o pierde conectividad, la beta queda inaccesible.
No se modificaron automáticamente los ajustes de energía del equipo.

La CDN general y los hostnames públicos de Tunnel tienen restricciones para
entregar video. No usar el túnel como CDN de video ilimitada. R2 tiene una
franquicia de almacenamiento y operaciones, con cargos al excederla. Usar R2
como almacenamiento no garantiza que Streamplace entregue automáticamente sus
segmentos desde R2: hay que implementar y validar esa ruta. La plantilla no
la activa ni contrata Cloudflare Stream.

Fuentes oficiales: [límites Workers](https://developers.cloudflare.com/workers/platform/limits/),
[Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/),
[Containers](https://developers.cloudflare.com/containers/platform/pricing/),
[R2](https://developers.cloudflare.com/r2/pricing/),
[entrega de video](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/).

## Aplicación HTTPS

`packages/pilot/.local/beta/app.env` contiene los orígenes y la ruta de la
clave OAuth privada, sin sus bytes. Después de crear la identidad institucional
registrada, completar `PILOT_INSTITUTION_DID` y `PILOT_ALLOWED_DIDS` con ella y
los alumnos invitados. El arranque falla si faltan, si los servicios son HTTP
o si la clave tiene permisos públicos.

```sh
pnpm --filter @apice/pilot beta:app
```

La aplicación sirve metadata pública en `/oauth-client-metadata.json` y usa
`private_key_jwt` ES256, PAR, PKCE y DPoP. Publica sólo la clave pública. Las
cookies HTTPS son `__Host-*`, Secure y HttpOnly. El PDS está fijado por
configuración: no es un cliente universal para cuentas de cualquier PDS.
Referencia: [OAuth ATProto](https://atproto.com/specs/oauth).

Las sesiones siguen en memoria y la institución necesita reconectar tras un
reinicio; `/ready` devuelve 503 hasta entonces. Todavía falta automatizar y
probar esa recuperación. `/ready` indica conexión institucional, no sustituye
una comprobación completa de almacenamiento o reproducción.

## Verificación y condiciones de apertura

```sh
pnpm --filter @apice/pilot test
pnpm --filter @apice/pilot check
pnpm --filter @apice/pilot beta:check
```

`beta:check` reporta pendientes y devuelve código 1 mientras DNS/HTTPS o el PDS
no estén listos. Una comprobación local correcta no acredita publicación.

Antes de invitar alumnos todavía deben pasar:

- OAuth real HTTPS y creación de Spaces con las cuentas registradas.
- Recuperación de sesión institucional y trabajo pendiente tras reinicio.
- Subir, procesar, publicar y reproducir un video real por la ruta pública.
- Integración de los clientes elegidos y recorrido alumno completo en teléfono.
- Backup fuera del equipo y restauración de cuentas, Spaces, claves y video.
- Prueba de concurrencia de la cohorte, avisos de error y alertas.
- Código versionado, release reproducible y procedimiento de retorno.
