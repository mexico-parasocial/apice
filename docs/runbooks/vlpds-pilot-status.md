# Estado del piloto VLPDS / Spaces

Implementación aislada en `packages/pilot/`. El entorno anterior, Prisma,
PostgreSQL y los clientes existentes siguen disponibles; no se migraron datos
reales. El objetivo de eliminar PostgreSQL se cumple en **la topología del
piloto**, no todavía en todo el producto desplegado.

## Evidencia de esta iteración

| Comprobación | Resultado |
|---|---|
| 16 pruebas de dominio, HTTP y OAuth | Pasan: secuencia, evaluación institucional, aislamiento, CSRF, idempotencia, pérdida de respuesta, outbox, validación del proxy y protecciones HTTPS de beta |
| OAuth + Spaces reales | Pasa contra VLPDS limpio fijado: inscripción → avance → quiz → constancia; videos son referencias de fixture |
| Privacidad | Sin acceso anónimo, entre alumnos ni al repo institucional; claves de respuesta ausentes en catálogo y registros públicos |
| Consentimiento de publicación | La finalización no aparece en el repo público hasta la acción explícita; repetir no duplica el registro |
| Caída de VLPDS | SIGKILL de un proceso de prueba, reinicio desde MinIO e índice de Ápice nuevo: datos y recibos recuperados |
| Preflight S3 | Las seis pruebas de corrección pasan: create condicional, CAS, ambas carreras, listado/lectura/borrado y multipart |
| Topología sin PostgreSQL | Compose inspeccionado: no servicios ni URLs PostgreSQL, ni Prisma; Streamplace SQLite y filer LevelDB2 |
| Backup | Cinco volúmenes en reposo, checksums y restauración en cinco volúmenes nuevos |
| Recuperación de datos restaurados | Arranque de MinIO desde el volumen restaurado, VLPDS apuntando exclusivamente a él: mismo DID y registro privado con nonce original |
| Subida Streamplace | **Pendiente**: ya se verificó la sesión real del proxy; falta implementar y probar el recorrido de upload |
| Restauración de video y reproducción | **Pendiente**, requiere completar primero la subida real |
| iM8 | **Opcional y sin conectar** en el piloto; el acceso probado es OAuth directo |

VLPDS se compiló desde un checkout limpio de
`mexico-parasocial/vlpds@e215170d27d65b3360a8bd0904bf53a29c0c848b`
y reportó `1.1.0+e215170d27`. No se usó el binario inicial de otro checkout
con modificaciones para la validación final de Spaces y caída.

La prueba de almacenamiento usó la imagen local MinIO
`sha256:a43c79386a4b3d6ff1fe67ea425b9e9980ee1b1c2b10229f396f9d6a3fd05f84`.
El Dockerfile agregado fija otras revisiones upstream para reconstrucción;
esa reconstrucción de MinIO y el perfil Docker de VLPDS aún no se ejecutaron.
Streamplace probado: imagen local v0.11.13
`sha256:49274034a8adc6e4f65faeb4219c95473ce45fa2fe5dd350ab855cbb58674bb2`.
SeaweedFS: imagen 4.42 fijada por digest en Compose.

Se observó que suscribirse al firehose global agotaba los recursos del nodo
local de prueba. Compose ahora apunta Streamplace únicamente al feed del PDS
del piloto. No se borraron ni reiniciaron servicios de otros proyectos.

## Qué falta para aprobar el piloto completo

1. Integrar OAuth del proxy Streamplace, verificando identidad, issuer,
   audiencia y DPoP con el entorno de PDS aislado. El modo HTTP y los DIDs sin
   registrar del fixture no son compatibles de extremo a extremo con los
   supuestos del proxy fijado. No sustituir esto por aceptar tokens sin validar.
2. Subir un video real por TUS, transcodificar, publicar su URI/CID y enlazarlo
   al curso desde la interfaz. Probar reproducción y recuperación del video.
3. Completar integración de los clientes existentes, preferencias y biblioteca,
   permisos administrativos, sincronización federada y operaciones de cuenta.
4. Si se decide activar iM8, implementar su broker y la delegación PDS aceptada;
   la wallet/VC requiere su propio contrato y pruebas. Ninguna copia del alumno
   debe convertirse en evidencia oficial de evaluación.

Los modelos privados `app.apice.*` son contratos de aplicación experimentales;
las escrituras desconocidas para el PDS se validan en el runtime. No se han
publicado lexicons ni declaraciones de tipos Spaces para interoperabilidad.
Antes de ampliar el piloto a otros clientes hay que versionar y publicar esos
contratos. No se implementó un sustituto universal del servidor anterior.

Instrucciones y límites completos: [README del piloto](../packages/pilot/README.md).

## Avance posterior: cuenta pública para video

Se agregó un adaptador de OAuth para el modo público de oatproxy. Corrige el
transporte hacia el puerto configurado y permite comprobar los tokens del
nodo por firma, emisor, audiencia, sujeto, expiración y clave DPoP. Su proxy
queda fijado al backend local y rechaza destinos suministrados por peticiones.

Con una cuenta Bluesky se completó el consentimiento real en `bsky.social`,
después de recibir autorización explícita del propietario para los permisos
actuales. La contraseña se envió exclusivamente al proveedor y no se agregó
a archivos del proyecto. Una consulta autenticada confirmó que el nodo acepta
la sesión, sin crear uploads ni publicar registros. El alcance de esta versión
incluye perfil, seguimientos y bloqueos, además de Streamplace; la prueba
no realiza esas operaciones.

Se corrigió otra incompatibilidad de v0.11.13: anuncia `/oauth/jwks` pero no
implementa esa ruta. Se provisiona la clave pública de acceso desde el volumen
local aislado, con montaje de sólo lectura y sin red, para validar la firma
del token sin exportar claves privadas ni sesiones. El recorrido completo de
subida, publicación y reproducción sigue pendiente.

## Acceso a AWS verificado (2026-10-17)

El perfil local `apice` autentica la cuenta `942752161853`. Se verificó el
acceso de lectura al bucket `apice-942752161853-us-east-2-an` en `us-east-2`:
vacío, las cuatro opciones de bloqueo de acceso público activas y cifrado por
defecto AES256. `get-bucket-versioning` no reporta versionado habilitado.
No se escribieron objetos ni se modificó configuración de AWS.

La identidad actual es `root`. Se preparó `infra/aws-pilot-policy.json`, una
política de identidad limitada a objetos bajo `apice-pilot/*`, listado de ese
prefijo y consulta de región, usando TLS. Es un documento para asignar a una
identidad del piloto; no se crearon usuarios, roles ni claves y no se aplicó
la política. No limita otros permisos que esa identidad ya pueda tener.
`infra/aws-storage.json` contiene el destino sin credenciales, todavía inactivo
para los servicios. El almacenamiento local del piloto sigue activo.

Hay una incompatibilidad concreta antes de conectar VLPDS: su dependencia
fijada `vlsync-store@de9d99d` construye `AmazonS3Builder::new()` con access key
y secret explícitos, sin session token ni proveedor de credenciales renovables.
Por tanto, la sesión temporal de `aws login` funciona en la CLI, pero no basta
con pasar sus dos claves al binario actual. Hace falta adaptar el proveedor
de credenciales y su renovación antes del preflight VLPDS contra AWS; no se
debe resolver creando claves permanentes del usuario raíz.

## Beta para para-g0v.site (2026-10-19)

El propietario eligió Cloudflare Free y su Mac como origen; el registro del
dominio está en curso. Se preparó una topología nueva `apice-beta`, con objetos
y estado Streamplace en volúmenes independientes, secretos generados en archivos
privados y puertos publicados sólo en loopback. El PDS inicia fuera de dev mode,
con KEK propia, PLC directory e invitaciones obligatorias. No se crearon todavía
cuentas reales ni se migraron fixtures. El almacenamiento activo de esta beta
es local; AWS/R2 no se activaron.

Se agregó a Ápice un modo HTTPS con metadata OAuth pública, autenticación
confidencial ES256, cookies __Host- Secure y lista de DIDs invitados. Las pruebas
locales pasan; todavía no se completó un OAuth real contra el dominio público.
Las sesiones continúan en memoria. Los clientes anteriores siguen sin adaptar.

La plantilla Tunnel está validada y separada de los puertos del piloto. Deja
video en 503 hasta integrar una ruta de entrega compatible con las restricciones
de Cloudflare; Tunnel público no es una CDN de video gratuita ilimitada.
DNS, autenticación Cloudflare, entrega de media, recuperación y aceptación final
siguen pendientes. Ver [runbook de la beta](BETA_PARA_G0V.md).
