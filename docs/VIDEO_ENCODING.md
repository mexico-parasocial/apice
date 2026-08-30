# Codificación de video — decisión y evidencia

**Fecha:** 2026-08-22 · **Estado:** decidido para el fuente; pendiente la escalera del nodo

---

## La decisión

**Todo video de lección se normaliza a 1080×1920 @ 1.5 Mbps antes de publicarse
al nodo Streamplace**, con `scripts/prepare-lesson-video.sh`.

## Por qué importa antes de publicar

El nodo transcodifica al ingresar, pero **no expone configuración de escalera**:
trabaja con lo que le demos, y el peldaño más alto de un transcodificador queda
acotado por su fuente. Subir capturas de teléfono sin normalizar fija un techo
caro para siempre.

Y es caro de revertir: recodificar una biblioteca ya publicada significa
regenerar los AT URI y volver a vincularlos lección por lección. Decidirlo bien
al principio cuesta un script; decidirlo después cuesta una migración.

## La evidencia

Medido contra `server/fixtures/videos/TESTCLIP.MP4` (1080×1920, 30 fps, H.264 a 3.2 Mbps),
con VMAF contra el fuente:

| Peldaño | Bitrate | Programa de 25 min | VMAF |
|---|---|---|---|
| 1080×1920 | 1.5 Mbps | **281 MB** | 87.7 |
| 720×1280 | 800 kbps | 150 MB | 82.0 |
| 540×960 | 500 kbps | 94 MB | 74.3 |
| 360×640 | 280 kbps | 52 MB | 57.2 |
| solo audio | 64 kbps | 12 MB | — (aritmética, no medido) |
| **sin normalizar** | 3.2 Mbps | **606 MB** | (referencia) |

> **Estos números son un piso, no un pronóstico.** El clip medido es un robot en
> movimiento: mucho más movimiento y detalle que una persona hablando a cámara.
> Material real de lección debería puntuar bastante mejor al mismo bitrate.

## Por qué 1.5 Mbps

El público está en planes de prepago mexicanos. **606 MB por programa es un
paquete de datos completo** — deja fuera justo a quien la plataforma existe para
alcanzar. 1.5 Mbps es donde la curva se aplana para este contenido: subir más
compra poca calidad visible y duplica la cuenta.

## Regla de diseño: el texto no va en el video

Citas legales, números de artículo y texto de diapositiva **dejan de leerse
alrededor del peldaño de 540**, lo que obliga a todo el mundo a un peldaño caro
solo para poder leer.

Ese texto va en la descripción de la lección o en la transcripción, donde no
cuesta datos, se puede seleccionar y copiar, y lo alcanza un lector de pantalla.
Es una decisión de accesibilidad tanto como de costo.

## Uso

```bash
./scripts/prepare-lesson-video.sh grabacion-original.mp4
```

Ajustable por entorno cuando haga falta (`LESSON_VIDEO_BITRATE`,
`LESSON_VIDEO_HEIGHT`, `LESSON_AUDIO_BITRATE`). Nunca escala hacia arriba: un
original de 480p no gana detalle recodificado a 1080, solo bitrate.

## Lo que queda pendiente

1. **La escalera del nodo.** Normalizar el fuente acota el techo, pero no
   decide qué peldaños genera Streamplace por debajo. Hay que averiguar si la
   versión 0.11.13 los expone, o preguntar upstream.
2. **El peldaño de solo audio.** Para una lección hablada, 12 MB contra 281 MB
   es la diferencia entre poder estudiar y no poder. Requiere soporte del
   reproductor y una entrada en el manifiesto HLS.
3. **Descarga para ver sin conexión.** Ataca el mismo problema desde el otro
   lado: descargar una vez en WiFi y ver sin gastar datos móviles.
