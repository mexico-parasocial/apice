# UI de Ápice: primera entrega y revisión pendiente

Fecha: 1 de octubre de 2026.
Actualización de evidencia: 8 de octubre de 2026.

## Cambios implementados

- `AppButton`: variantes primaria, secundaria, navegación y salida; indicador
  de operación pendiente, bloqueo mientras espera, área mínima de 48 px y foco web.
- `AppTextField`: etiqueta visible y accesible, ayuda/error asociado al campo,
  foco, estado no editable y colores del tema. Admite refs para mover el foco.
- `SurfaceCard`: fondo, borde, radio y espaciado compartidos.
- `FeedbackBanner`: mensajes de información, éxito, advertencia y error,
  con acción opcional y anuncios de cambios para tecnologías de asistencia.
- Estados existentes: error con reintento compartido y estado vacío con acción.
- Catálogo: controles compartidos, contenido limitado en escritorio, confirmación
  de inscripción dentro de la pantalla, errores en español y búsqueda sin resultados.
- Acceso: formulario limitado a 480 px, controles compartidos, errores visibles,
  foco de correo a contraseña y protección del envío por teclado durante una operación.
- Perfil: controles de vinculación compartidos, errores de carga con reintento
  en certificados/notificaciones y mensaje recuperable si falla la descarga.
- El aviso offline reutiliza el componente de feedback y los colores del tema.
- Vista «Componentes», exclusiva de desarrollo, con ejemplos de todos los
  controles y estados; permite alternar su tema sin modificar las preferencias del sistema.

La integración inicial cubre catálogo, acceso y perfil. El reproductor,
cuestionario, onboarding y admin conservan controles por migrar en sus entregas.

## Reglas iniciales

| Elemento | Regla |
| --- | --- |
| Botón y campo | Altura mínima de 48 px; pueden crecer cuando el texto lo requiere |
| Radio de control | 12 px |
| Radio de tarjeta | 16 px |
| Espaciado | Unidad de 8 px, padding base de 16 px |
| Texto sobre botón primario | Blanco en claro; morado oscuro sobre el primario claro del tema oscuro |
| Colores | Roles semánticos derivados del tema ALF, con advertencia dorada en ambos temas |
| Formularios de acceso | Máximo de 480 px y scroll cuando el contenido excede la pantalla |
| Lectura y catálogo | Máximo compartido de 720 px a partir de tablet |
| Errores | Mensaje en español en el contexto de la acción y salida recuperable |

## Matriz de estados para revisión visual

Todos los casos requieren revisión en claro y oscuro. Esta matriz describe
los resultados esperados; no certifica que la revisión manual haya ocurrido.

| Superficie | Caso | Resultado esperado |
| --- | --- | --- |
| Botones | Disponible, foco, pulsación | Acción visible; foco perceptible; sin cambio de tamaño |
| Botones | Pendiente o deshabilitado | Sin nuevos envíos; nombre de estado anunciado; texto visible |
| Botones | Etiqueta larga | Texto ajustado, sin recorte ni salida del contenedor |
| Campos | Vacío, completado, foco | Etiqueta persistente y contraste legible |
| Campos | Error | Mensaje visible y asociado al campo para lector de pantalla |
| Campos | No editable | Estado distinguible; sin entrada de texto |
| Catálogo | Carga y fallo de red | Mensaje de carga o error con reintento |
| Catálogo | Lista vacía | Mensaje «Aún no hay programas» |
| Catálogo | Búsqueda vacía | Mensaje «Sin resultados» y acción para limpiar la búsqueda |
| Catálogo | Inscripción pendiente | Control pendiente; otros envíos de inscripción bloqueados |
| Catálogo | Inscripción exitosa | Confirmación y acceso directo al programa |
| Catálogo | Inscripción fallida | Error dentro de la pantalla; se puede volver a intentar |
| Acceso | Datos incompletos | Botón deshabilitado; teclado no envía un formulario incompleto |
| Acceso | Envío por correo o identidad | Ambos métodos bloqueados durante la operación |
| Acceso | Credenciales incorrectas | Error visible en el método utilizado |
| Perfil | Notificaciones/certificados cargando | Mensaje de carga, no una lista vacía |
| Perfil | Fallo al cargar | Mensaje de error con reintento |
| Perfil | Sin notificaciones/certificados | Mensaje vacío correspondiente |
| Perfil | Fallo al vincular Bluesky | Error asociado al campo; control disponible para reintento |
| Perfil | Fallo de descarga | Mensaje visible; se puede usar nuevamente el botón del certificado |
| Offline | Pérdida de conexión | Aviso de advertencia con colores del tema |

## Tamaños y accesibilidad pendientes

- [ ] Móvil pequeño: 360 px de ancho.
- [ ] Móvil grande: 430 px de ancho.
- [ ] Tablet: 768 px de ancho.
- [ ] Escritorio: 1440 px de ancho.
- [ ] Navegación por teclado: Tab, Shift+Tab, Enter y espacio.
- [ ] Texto ampliado y etiquetas largas sin recortes.
- [ ] Lectores de pantalla: etiquetas, errores, pendientes y cambios de feedback.
- [ ] Teclado nativo y áreas seguras en iOS y Android.
- [ ] Capturas de visitante, alumno nuevo, inscrito y alumno con programa terminado.

## Verificación realizada

- `pnpm --filter @apice/mobile typecheck`: pasó.
- `pnpm --filter @apice/mobile-app typecheck`: pasó.
- `pnpm --filter @apice/mobile test`: 4 archivos, 28 pruebas existentes, todas pasaron.
- `pnpm --filter @apice/mobile-app exec expo export --platform web`: pasó.

Los tests existentes cubren tema, certificados, geometría de lecciones y cola
offline. No verifican la apariencia ni las interacciones de los nuevos controles.

La revisión inicial se bloqueó en el navegador integrado con
`net::ERR_BLOCKED_BY_CLIENT`. El 7 de octubre se pudo inspeccionar en Firefox
nativo el acceso y el formulario de registro, en modo oscuro y con ancho de
aproximadamente 963 px. Las capturas quedaron en la conversación; no se
exportaron archivos. Esto no completa los casos de la matriz. El 8 de octubre
no se pudo ampliar la revisión porque el Mac estaba bloqueado.

## Cómo revisar esta entrega

La instancia actual de Ápice usa `http://127.0.0.1:8091`; el puerto 8090 está
ocupado por otro servicio. Si no está activa:

```bash
pnpm --filter @apice/mobile-app exec expo start --web --port 8091 --localhost
```

Abrir la pestaña «Componentes» para revisar las muestras y alternar claro/oscuro.
Abrir «Programas» y «Perfil» para revisar las pantallas integradas. Los estados
reales de inscripción, acceso y descarga requieren que la API esté disponible.

## Siguiente entrega

Registro, activación, recuperación y retorno al programa ya están implementados
en la segunda entrega, documentada en `docs/UI_AUTH_REVIEW.md`. Sigue pendiente
completar la matriz visual y continuar con onboarding e identidad en contexto
según `docs/UI_IMPLEMENTATION_PLAN.md`.
