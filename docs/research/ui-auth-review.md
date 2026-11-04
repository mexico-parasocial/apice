# Acceso de Ápice: implementación y verificación

Fecha: 8 de octubre de 2026.

## Recorrido implementado

- Inicio, catálogo y ficha ofrecen acceso a la cuenta. El formulario también
  está disponible desde Perfil.
- Registro solicita nombre, correo, contraseña y confirmación. Valida los
  campos, muestra errores en contexto y bloquea envíos repetidos.
- Activación solicita un código de cuatro dígitos, con caducidad de cinco
  minutos. Permite reenviar después de un minuto; solo sirve el último código.
  El registro pendiente se conserva durante treinta minutos para reenviar.
  Al activarse la cuenta, se guarda la sesión y se vuelve al programa elegido.
- Recuperación solicita el correo y luego un código de seis dígitos y la nueva
  contraseña. El código vence en diez minutos. Después del cambio se vuelve al
  formulario de acceso, conservando el programa de destino.
- La ficha pública permite entrar e inscribirse gratis. Las consultas de
  contenido y progreso se habilitan cuando hay una cuenta inscrita.

## Backend y sesiones

Los tokens de activación y recuperación son aleatorios y opacos; el cliente no
recibe contraseñas ni hashes. Redis guarda el registro pendiente con contraseña
hasheada. La verificación y consumo del código son atómicos: admite cinco
intentos incorrectos y un único uso, incluso con envíos concurrentes.

Hay espera por correo de un minuto y límites por IP en las solicitudes de
correo. En producción, la respuesta de recuperación es la misma para un correo
existente, uno desconocido o una entrega fallida. El código de desarrollo solo
se devuelve fuera de producción cuando SMTP no está disponible, y su aviso en
la app solo aparece en compilaciones de desarrollo.

Cambiar la contraseña invalida los refresh tokens y las sesiones anteriores.
La versión de sesión impide reutilizar un access token anterior incluso después
de iniciar una sesión nueva. Un código emitido antes de otro cambio de
contraseña tampoco puede restablecerla. Las búsquedas de acceso y recuperación
admiten correos antiguos con mayúsculas; los registros nuevos usan minúsculas.

La app limpia consultas de cuenta al cerrar sesión, al recibir un rechazo 401
o al cambiar de usuario. Guarda los datos de acceso antes de mostrar la sesión
activa y no reintenta automáticamente solicitudes de credenciales.

Los correos de activación y recuperación usan textos en español y la marca
Ápice. El build copia las plantillas EJS junto al servidor compilado; el
transporte SMTP tiene tiempos máximos de conexión y espera.

## Verificación realizada

| Comprobación | Resultado |
| --- | --- |
| Typecheck de servidor, mobile y mobile-app | Pasó |
| Build del servidor | Pasó; incluye plantillas de correo |
| Pruebas del servidor | 13 archivos, 97 pruebas, todas pasaron |
| Pruebas del paquete mobile | 4 archivos, 28 pruebas, todas pasaron |
| Exportación web | Pasó; `/tmp/apice-ui-auth-web` |
| Render de ambos correos desde el servidor compilado | Pasó, con SMTP simulado |
| Inspección visual de acceso y registro | Firefox, modo oscuro, 7 de octubre |

Las diez pruebas de integración nuevas usan un Redis desechable real, con base
de datos y correo simulados. Cubren activación, caducidad, reenvío, límite de
intentos, recuperación de correos con mayúsculas, uso único, concurrencia,
invalidación de sesiones y respuestas de producción. Una prueba adicional
renderiza las dos plantillas con SMTP simulado. No se enviaron correos reales
ni se modificaron cuentas existentes durante estas pruebas.

## Pendientes de validación

- Recorrido manual completo con cuenta nueva y existente, correo SMTP real y
  regreso al programa. La navegación de destino se comprobó mediante código
  y tipos, sin ejecutar todo el recorrido en la interfaz.
- Activación y recuperación en ambos temas, a 360, 430, 768 y 1440 px; teclado,
  texto ampliado y lector de pantalla.
- iOS y Android: teclado, áreas seguras y restauración de sesión.
- El 8 de octubre la revisión visual quedó bloqueada porque el Mac estaba
  bloqueado. La app de desarrollo está disponible en `http://127.0.0.1:8091`.

## Próximo tramo del plan

Onboarding breve, persistencia de su finalización y vinculación de identidad
antes del video con regreso al programa. Esta entrega cierra la implementación
del acceso; la fase 1 completa todavía depende de ese tramo y de la validación
manual pendiente.
