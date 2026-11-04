# Onboarding breve de Ápice

Fecha: 16 de octubre de 2026.

## Recorrido

Después del primer acceso en un dispositivo, la app muestra dos pantallas:

1. Bienvenida con el nombre que ya tiene la cuenta y tres indicaciones: elegir
   un programa gratuito, aprender a su ritmo y retomar el progreso.
2. Elección de tema: seguir al dispositivo, claro u oscuro. La selección se ve
   inmediatamente y se guarda al pulsar «Empezar a aprender».

«Omitir introducción» permite entrar desde el primer paso y también guarda la
finalización. No se solicitan nuevos datos de perfil. Desde Perfil → Apariencia
se puede cambiar el tema posteriormente con confirmación de guardado o error.

La navegación actual exige iniciar sesión antes de entrar a la app, según la
decisión del 8 de octubre. El onboarding se integra entre acceso y las pantallas
principales; no restablece el catálogo público ni cambia esa decisión.

## Persistencia y fallos

La configuración se guarda en AsyncStorage con una clave por ID de cuenta y un
formato versionado: finalización y tema. Al reabrir o volver a iniciar sesión,
se recupera antes de decidir qué pantalla mostrar. Cerrar sesión conserva la
configuración; entrar con otra cuenta carga su propio registro. Las lecturas
pendientes de una cuenta anterior se descartan al cambiar de cuenta.

Si falla una lectura, hay reintento y salida para cerrar sesión. Si falla el
guardado, el onboarding permanece abierto con error y permite volver a intentar;
no se marca como finalizado en memoria. Un registro ilegible o incompatible
vuelve a tratarse como configuración pendiente.

El alcance es cuenta y dispositivo (en web, origen y perfil del navegador).
Otro dispositivo o borrar el almacenamiento hará aparecer la introducción de
nuevo. No se modifica la base de datos ni se sincroniza la preferencia al servidor.

Se reutilizan los controles compartidos, los tokens del tema y el tipo de tema
del onboarding existente. El flujo anterior de cuatro pasos queda intacto para
sus consumidores; la app soportada usa el flujo breve.

## Verificación

- Typecheck de `@apice/mobile` y `@apice/mobile-app`: pasó.
- Pruebas de `@apice/mobile`: 5 archivos, 38 pruebas, todas pasaron. Diez nuevas
  verifican persistencia, aislamiento entre cuentas, cambio posterior de tema,
  registros inválidos, fallos de lectura/escritura y cuenta ausente.
- Exportación web: pasó; artefacto en `/tmp/apice-ui-onboarding-web`.
- Firefox: ambos pasos en claro y oscuro, ancho aproximado de 963 px y viewport
  móvil simulado de 360 × 780 px; sin recortes en los controles revisados.
- Teclado: Tab y Enter permiten avanzar; cambiar de paso lleva el foco al
  encabezado antes de los controles nuevos.
- Recorrido con API local ficticia: acceso → onboarding → tema claro → entrada
  a la app → recarga sin repetir onboarding → Perfil y tema oscuro → cierre
  de sesión → segunda cuenta con su propia bienvenida → omitir → cerrar sesión
  → primera cuenta con tema oscuro y sin repetir introducción.

Las capturas se mostraron en la conversación. La API ficticia de revisión usó
solo cuentas de ejemplo y listas vacías; no prueba contenidos, SMTP ni servicios
reales. No se modificaron cuentas existentes. Los procesos de prueba se cierran
al finalizar la revisión; para arrancar la app con su API configurada:

```bash
pnpm --filter @apice/mobile-app exec expo start --web --port 8091 --localhost
```

## Pendientes

- Revisión en iOS y Android, lector de pantalla y texto ampliado.
- Matriz visual completa a 430, 768 y 1440 px.
- Vinculación de identidad en el contexto de video, en la siguiente entrega.
