# Ápice: despliegue sin Cloudflare

Preparación del 2026-10-26. Dominio confirmado por el propietario:
`para-g0v.site`. Aún no hay cuenta ni VM de Oracle y este documento no acredita
un despliegue público. No se han cambiado DNS, claves, cuentas ni volúmenes.

## Almacenamiento que existe hoy

- `packages/pilot/infra/compose.yaml`: MinIO para VLPDS y SeaweedFS para
  Streamplace. Son dos sistemas de objetos que podríamos consolidar.
- `packages/pilot/infra/beta-compose.yaml`: una sola instancia MinIO con
  buckets `apice-beta-pds` y `apice-beta-videos`. La beta ya evita SeaweedFS.
- VLPDS está fijado a `e215170d27d65b3360a8bd0904bf53a29c0c848b`. En este
  checkout no hay un RustFS incorporado. El Compose de desarrollo del fork
  remoto consultado también utiliza MinIO. No confundir el binario VLPDS,
  escrito en Rust, con un servidor RustFS.

Una instancia RustFS podría sustituir a MinIO y SeaweedFS si sirve los dos
consumidores correctamente. Mantener buckets, permisos y credenciales
separados para PDS y video. VLPDS exige PUT condicional, CAS por ETag y
consistencia de lectura/listado; anunciar compatibilidad S3 no basta.

Antes del cambio: fijar la versión e imagen de RustFS, ejecutar el
`vlpds-bucket-probe` del pin en un bucket de prueba, comprobar recuperación
del PDS y probar upload TUS, transcodificación, publicación y reproducción de
Streamplace. Migrar los objetos mediante la API S3 y verificar restauración
antes de retirar cualquier almacenamiento anterior. Nunca reutilizar el
directorio de datos de MinIO/SeaweedFS como directorio de RustFS.

## Hosting elegido como propuesta

Una VM ARM de Oracle Cloud Always Free es la opción recomendada para probar
el stack completo sin cuota mensual de cómputo, dentro de sus límites.
La documentación consultada indica 1.500 OCPU-h y 9.000 GB-h mensuales,
equivalentes a 2 OCPU y 12 GB de RAM, y 200 GB de discos entre arranque y
datos. Verificar la etiqueta Always Free y el estimado en la consola antes de
crear recursos: no basarse en los créditos temporales de la prueba.

La capacidad gratuita puede agotarse en una región y Oracle puede recuperar
instancias inactivas. Es una opción para la beta, sin promesa de disponibilidad
de producción. El volumen local tampoco sustituye un backup fuera de la VM.

Render Free duerme tras 15 minutos sin tráfico y no permite disco persistente.
Koyeb Free ofrece 512 MB/0,1 vCPU, sin volúmenes, y escala a cero tras una hora.
Pueden servir para pruebas de componentes pequeños; no alojan adecuadamente
este conjunto de VLPDS, objetos y transcodificador.

## Topología prevista

```text
Internet → Caddy / HTTPS en la VM
  para-g0v.site       → runtime Ápice
  pds.para-g0v.site   → VLPDS + Spaces
  vod.para-g0v.site   → Streamplace

VLPDS     → almacenamiento S3 privado / bucket de PDS
Streamplace → el mismo servidor S3 / bucket de video
```

Caddy obtiene certificados de Let's Encrypt; DNS puede quedarse en el
registrador u otro proveedor con plan gratuito. No hace falta trasladarlo a
Cloudflare. La API S3, su consola, las métricas y la administración del PDS
quedan fuera de las rutas públicas.

VLPDS crea handles bajo su dominio configurado. Si usamos
`alumno.pds.para-g0v.site`, preparar también `*.pds.para-g0v.site` y definir
cómo se emitirán sus certificados. Un wildcard requiere ACME DNS-01 y una
integración compatible con el proveedor DNS elegido. No dar por resuelto este
punto sólo porque los tres hosts principales tienen certificado.

## Pasos para continuar

1. El propietario crea su cuenta Oracle y una VM Ubuntu ARM Always Free,
   hasta 2 OCPU/12 GB, con SSH por clave e IP pública. Revisar el estimado
   antes de aceptar. Si no hay capacidad gratuita, no seleccionar una VM de
   pago automáticamente.
2. Preparar una distribución Linux reproducible del piloto: reconstruir
   VLPDS y Streamplace para ARM64, imágenes publicables fijadas por digest y
   rutas de secretos del servidor. Los IDs de imagen en caché y rutas
   absolutas de esta Mac no constituyen un despliegue portátil.
3. Elegir un único backend de objetos. Mantener el MinIO de la beta hasta que
   RustFS pase las pruebas anteriores; su sustitución no es requisito para
   preparar el hosting. Instalar Caddy y supervisar PDS y runtime como
   servicios; conservar un solo escritor institucional.
4. Configurar DNS y HTTPS con la IP de la VM y el proveedor DNS del dominio.
   El 2026-10-26, las consultas NS/A a resolvers públicos devolvieron
   NXDOMAIN para `para-g0v.site`. El RDAP autoritativo confirma el registro,
   los NS `george.ns.cloudflare.com` y `teresa.ns.cloudflare.com`, y el estado
   `server hold`, que impide publicar su delegación. Solicitar a Porkbun la
   causa y que tramite el levantamiento con el registro. No es suficiente
   esperar propagación o volver a cambiar los NS. DNSSEC no aparece firmado
   en ese RDAP. Este bloqueo debe resolverse también si se abandona Cloudflare.
5. Validar OAuth HTTPS, subida y reproducción reales, recorrido de alumno,
   reconexión institucional después de reinicio y restauración completa de
   PDS, claves y video. Abrir invitaciones después de esa aceptación.

## Fuentes consultadas

- [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).
- [Render Free](https://render.com/docs/free).
- [Koyeb: instancias](https://www.koyeb.com/docs/reference/instances).
- [VLPDS: requisitos del object store](https://github.com/mexico-parasocial/vlpds/blob/main/docs/operations/object-store.md).
- [VLPDS: Compose de desarrollo](https://github.com/mexico-parasocial/vlpds/blob/main/build/docker-compose.yml).
- [RDAP autoritativo del dominio](https://rdap.radix.host/rdap/domain/para-g0v.site).
- [ICANN: estados EPP, incluido serverHold](https://www.icann.org/resources/pages/epp-status-codes-2014-06-16-en).
