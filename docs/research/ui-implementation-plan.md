# Plan de UI de Ápice

Fecha: 1 de octubre de 2026.

## Objetivo

Que una persona pueda descubrir un programa, entrar a su cuenta, inscribirse,
vincular la identidad necesaria para reproducir video, aprender, retomar su
progreso y obtener su certificado sin ayuda del facilitador.

Este plan parte de una revisión del código. La primera tarea será validar
visualmente las pantallas actuales; todavía no se han verificado sus layouts
en navegador ni en dispositivos durante esta revisión.

Avance al 8 de octubre: controles compartidos aplicados al catálogo, acceso y
perfil; registro, activación, recuperación y retorno al programa implementados.
Pasaron typecheck de los tres paquetes afectados, build del servidor, 97 pruebas
del servidor, 28 del paquete compartido y exportación web. Se inspeccionaron
acceso y registro en Firefox en modo oscuro; falta completar la matriz visual y
el recorrido con correo real. Consultar `docs/UI_PHASE0_REVIEW.md` y
`docs/UI_AUTH_REVIEW.md` para evidencia y pendientes.

Avance al 16 de octubre: onboarding breve de dos pantallas después del acceso,
con bienvenida, tema y opción de omitir. Su finalización y el tema se guardan
por cuenta en este dispositivo; Perfil permite cambiar el tema. Pasaron los
typechecks de mobile y mobile-app, 38 pruebas compartidas y exportación web.
Se verificaron ambos temas, teclado, recarga, reingreso, cambio de cuenta y
omisión en Firefox con API ficticia local, incluyendo un viewport de 360 px.
Detalle en `docs/UI_ONBOARDING_REVIEW.md`.

## Alcance y decisiones

- Trabajar sobre `packages/mobile-app/`, la app soportada, y sus componentes
  compartidos en `packages/mobile/`. El panel administrativo vive en `admin/`.
- Conservar la identidad morada y dorada y las tipografías actuales del alumno.
- Reutilizar el onboarding, los estados y los hooks existentes cuando encajen.
- El producto es gratuito: no hay pagos, precios ni facturación.
- ~~El visitante puede explorar el catálogo.~~ Decisión revisada (8 oct 2026):
  hay que iniciar sesión para entrar a la app. Sin sesión solo se muestra la
  pantalla de acceso, sin barra de navegación.
- Ofrecer primero nombre y preferencias útiles. Revisar los campos actuales
  del onboarding; fecha de nacimiento, género, estado y estilo de aprendizaje
  no deben ser requisitos automáticos para empezar a aprender.
- INE es condicional: implementarla antes del piloto únicamente si el programa
  exige esa verificación. En ese caso, pasa a ser una dependencia del acceso.

## Dependencias comprobadas

| Función | Base existente | Trabajo pendiente |
| --- | --- | --- |
| Registro por correo | `/registration`, `/activate-user` y `/resend-activation`; UI y hooks | Validar entrega SMTP y recorrido manual en las tres plataformas |
| Recuperación de contraseña | `/forgot-password` y `/reset-password`; UI y hooks | Validar entrega SMTP y recorrido manual en las tres plataformas |
| Edición del perfil | `/update-user-info` y `/update-user-avatar` | Verificar contratos y conectar formularios |
| Mis programas | `/get-all-progress` | Hook compartido, tipos y biblioteca con todos los inscritos |
| Inscripción | Hooks de estado e inscripción gratuita | Sincronizar catálogo, ficha, inicio y biblioteca |
| Notificaciones | Lectura del alumno; actualización solo para admin | Lectura por usuario, destinos y paginación si se ofrece todo el historial |
| INE | `/ine/me`, `/ine/submit` y revisión administrativa | UI del alumno y estados de envío/revisión |
| Preferencias | Tema y onboarding breve integrados; guardado local por cuenta y edición en Perfil | Validar iOS/Android; la sincronización entre dispositivos queda fuera de esta entrega |

## Fase 0 — Base visual y estados compartidos

**Prioridad: P0. Entrega: componentes y reglas que usarán las demás fases.**

- [ ] Capturar las pantallas actuales con datos representativos: visitante,
  alumno nuevo, inscrito y alumno con programa terminado.
- [ ] Revisar móvil pequeño, móvil grande, tablet y escritorio; modo claro y oscuro.
- [x] Definir variantes de botón primario, secundario, pendiente y deshabilitado;
  input con etiqueta/error; tarjeta; aviso de éxito/error; estado vacío y reintento.
- [x] Partir de `states.tsx`, los componentes compartidos y el tema existentes.
- [x] Centralizar colores, espaciados y mensajes visibles en español en los controles migrados.
- [x] Definir ancho de contenido y comportamiento de formularios/listas de acceso, catálogo y perfil.
- [ ] Resolver la semántica de botones, selección de respuestas, foco de teclado
  y mensajes anunciables por lector de pantalla en los componentes afectados.

**Aceptación:** los componentes se pueden revisar en ambos temas; estados
pendiente/deshabilitado son distinguibles; inputs tienen etiquetas; el foco
es visible y los controles se pueden usar con teclado en web.

## Fase 1 — Acceso y primera sesión

**Prioridad: P0. Depende de la fase 0.**

- [x] ~~Añadir un acceso visible a iniciar sesión desde Inicio y desde las
  acciones que requieren una cuenta.~~ Sustituido (8 oct 2026): el acceso es
  obligatorio desde el inicio; sin sesión solo se ve la pantalla de acceso.
- [x] Integrar registro y activación por correo, con validación de campos y
  recuperación ante código incorrecto o vencido. Añadir reenvío si el contrato
  actual no lo soporta y se mantiene este método de activación.
- [x] Implementar solicitud y restablecimiento de contraseña en backend y UI.
- [x] ~~Conservar el programa de destino durante el acceso; volver a él al terminar.~~
  Ya no aplica: sin sesión no se puede explorar, así que no hay un destino
  previo que conservar.
- [x] Integrar un onboarding breve y persistir su finalización para no repetirlo
  al reabrir o volver a iniciar sesión con la misma cuenta en este dispositivo.
- [~] Mostrar la vinculación de Bluesky antes de intentar reproducir un video
  que la requiera, con motivo claro y regreso al programa después de vincular.
  Hecho en el reproductor (8 oct 2026): sin identidad vinculada ya no se pide
  el video, se muestra el formulario de inmediato. Pendiente: avisar también
  en la ficha del programa, antes de abrir una lección.
- [x] Unificar los errores del acceso en español dentro del formulario.

**Aceptación:** una cuenta nueva se registra y activa; una cuenta existente
entra y recupera su contraseña; al volver a abrir la app conserva su sesión;
el onboarding no se repite en el mismo dispositivo. Una cuenta sin Bluesky
puede completar la vinculación y volver al aprendizaje.

## Fase 2 — Inscripción y biblioteca del alumno

**Prioridad: P0. Depende de las fases 0 y 1.**

- [ ] Crear un hook tipado para todos los programas inscritos a partir de
  `/get-all-progress` y reutilizarlo en Inicio, catálogo y biblioteca.
- [ ] Incorporar «Mis programas» dentro de Programas, junto con «Explorar»,
  evitando añadir otra pestaña principal en la primera entrega.
- [ ] Mostrar todos los inscritos: por empezar, en curso y terminados; progreso
  y acceso a la siguiente lección disponible o al certificado cuando corresponda.
- [ ] Hacer que ficha y catálogo compartan la misma decisión de acción:

  | Estado | Acción principal |
  | --- | --- |
  | Visitante | Iniciar sesión para inscribirme |
  | Con cuenta, sin inscripción | Inscribirme gratis |
  | Inscrito, sin comenzar | Comenzar programa |
  | En curso | Continuar aprendiendo |
  | Terminado, certificado pendiente | Obtener certificado |
  | Terminado, certificado emitido | Ver certificado |

- [ ] Tras inscribirse, actualizar las superficies afectadas sin recargar y
  mostrar confirmación con acceso directo al programa.
- [ ] Invalidar los resúmenes al completar lecciones/cuestionarios; aislar o
  limpiar los datos de cuenta al cerrar sesión y al cambiar de usuario.
- [ ] Resolver estados vacíos de biblioteca y búsqueda, con acciones útiles.
- [ ] Evitar consultas autenticadas de contenido/progreso mientras el visitante
  está explorando una ficha pública.

**Aceptación:** la inscripción aparece inmediatamente en la biblioteca;
catálogo y ficha no vuelven a ofrecerla; continuar abre una lección disponible;
el progreso se actualiza al regresar y cambiar de cuenta no muestra datos del
usuario anterior. Las búsquedas sin resultados ofrecen limpiar la consulta.

## Fase 3 — Perfil, preferencias y notificaciones

**Prioridad: P1. Depende de las fases 0 y 1.**

- [ ] Añadir edición de nombre y avatar con guardado, cancelación y errores
  por campo; verificar antes qué datos admite la API actual.
- [ ] Exponer preferencias de tema y accesibilidad y restaurarlas al reiniciar.
- [ ] Separar notificaciones del resumen del perfil: mostrar fecha, estado
  leído/no leído y destino cuando exista una acción asociada.
- [ ] Añadir una operación del alumno para marcar sus notificaciones como leídas.
  Mantener la autorización administrativa separada. Para avisos generales,
  guardar lectura por usuario: leer un aviso no debe marcarlo para todos.
- [ ] Definir destinos de notificaciones desde los eventos reales; si el contrato
  no contiene programa/lección de destino, ampliarlo antes de añadir el enlace.
- [ ] Añadir estados de carga, error y reintento en certificados/notificaciones.
- [ ] Si aplica INE: selección de imágenes, revisión previa, envío, pendiente,
  aprobada, rechazada y reenvío con el motivo indicado por administración.

**Aceptación:** los cambios del perfil se conservan; un fallo de red no se
presenta como lista vacía; el alumno solo modifica su lectura; los enlaces
de notificaciones abren el destino correcto. INE cubre el ciclo completo si aplica.

## Fase 4 — Escritorio, temas y cierre del recorrido de aprendizaje

**Prioridad: P0 para defectos que impidan usar el piloto; P1 para el resto.**

- [ ] Aplicar el mismo ancho y alineación al catálogo completo, incluyendo
  filas de Inicio, cuestionarios y reproductor, no solo a sus encabezados.
- [ ] En escritorio, adaptar catálogo a una distribución que aproveche el espacio;
  revisar reproductor y acciones sin estirar textos ni controles.
- [ ] Sustituir colores fijos de inputs, encabezados y superficies por tokens
  donde deban responder al tema.
- [ ] Reemplazar los `alert()` dispersos por feedback compartido y errores
  recuperables; reservar confirmaciones modales para acciones que lo necesiten.
- [ ] Diferenciar fallo de conexión, falta de identidad, falta de inscripción,
  contenido inexistente y progreso pendiente de sincronizar.
- [ ] Revisar cuestionarios con respuestas largas, textos ampliados, teclado,
  scroll y estados de selección/envío.
- [ ] Mostrar recuperación explícita si falla la emisión o descarga del certificado.
- [ ] Revisar el banner offline y su posición respecto de áreas seguras y controles.

**Aceptación:** sin solapamientos ni desplazamiento horizontal accidental en
los tamaños objetivo; legibilidad en ambos temas; los controles principales
siguen accesibles con texto ampliado; cada error ofrece una salida concreta.
La UI distingue progreso guardado localmente de progreso sincronizado.

## Fase 5 — Panel administrativo coherente

**Prioridad: P1 para autoría y revisión del piloto; P2 para personalización secundaria.**

- [ ] Alinear logo, colores y tipografía con Ápice, conservando MUI cuando ayude.
- [ ] Traducir navegación, formularios, tablas, mensajes y metadatos; establecer
  el idioma del documento en español.
- [ ] Cambiar placeholders heredados por ejemplos de formación ciudadana.
- [x] Retirar precio, descuento, facturas y pagos (hecho 2026-10-27).
- [ ] Mejorar el flujo activo de crear/editar programas: guardar y publicar con
  estados claros, errores de campos y confirmación al salir con cambios pendientes.
- [ ] Unificar carga, vacío, error y confirmación en cursos, usuarios e INE.
- [ ] Verificar navegación y tablas en pantallas estrechas y acceso por teclado.

**Aceptación:** un administrador crea o edita un programa gratuito, prepara sus
lecciones y cuestionarios y revisa una INE si aplica sin encontrar mensajes de
venta ni textos del template. Los formularios permiten corregir errores sin
perder el trabajo ingresado.

## Orden de entregas

1. Componentes y estados compartidos + revisión visual inicial.
2. Registro, activación, recuperación y retorno al programa.
3. Onboarding breve + vinculación de identidad en contexto.
4. Acciones de inscripción + Mis programas + sincronización de progreso.
5. Correcciones de feedback, tema y responsive necesarias para el piloto.
6. Perfil, preferencias y notificaciones; INE antes si es requisito del piloto.
7. Unificación del admin, comenzando por crear/editar programas y revisión de INE.
8. Pulido restante de escritorio y personalización administrativa.

Cada entrega debe cubrir un flujo revisable y adjuntar capturas de los estados
afectados. No hace falta terminar todo el panel para validar el recorrido del alumno.

## Validación y salida al piloto

- Ejecutar typecheck de los paquetes afectados y build cuando corresponda.
- Agregar pruebas de comportamiento para las nuevas operaciones de backend,
  permisos de notificaciones, expiración de recuperación, decisiones de acción
  y aislamiento/sincronización de datos de cuenta. Evitar tests que solo repitan estilos.
- Probar manualmente los flujos modificados en web, Android e iOS, con cuenta
  nueva y existente; registrar cualquier plataforma no disponible como pendiente.
- Recorrer con contenido real: visitante → acceso → inscripción → identidad →
  video → cuestionario → progreso → certificado → cierre y reapertura → continuar.
- Interrumpir la red durante lectura y guardado de progreso; verificar recuperación
  al volver la conexión. Comprobar error de descarga y emisión del certificado.
- Validar con 5–10 alumnos según `docs/PILOT_CHECKLIST.md`; registrar dudas,
  errores y pasos que requieran ayuda, y ordenar el siguiente backlog por impacto.

**Listo para piloto:** el recorrido principal se completa, los bloqueos de
identidad/inscripción tienen una solución visible, se puede retomar lo aprendido
y no quedan errores visuales que impidan operar las pantallas usadas. Las APIs
de video, correo y certificados deben estar disponibles con contenido real para
dar por verificado el flujo completo.

## Próxima acción

Completar el aviso de identidad en la ficha del programa antes de abrir una
lección, aprovechando la vinculación ya disponible en el reproductor. Completar
las pruebas nativas del onboarding y la revisión
manual de acceso con correo real. Después abordar Mis programas y la
sincronización de inscripción/progreso; el admin sigue en su entrega posterior.
