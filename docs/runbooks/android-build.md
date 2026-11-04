# Build de Android

Estado verificado el **2026-10-27**: `expo prebuild --clean` + `assembleDebug` y
`assembleRelease` (con R8) compilan desde cero; el APK release instala y arranca
en un emulador Pixel 9 Pro XL (API 36), acepta entrada de texto y recibe el deep
link `apice://oauth/callback` sin fallos. No se probó contra un backend (sin
HTTPS local, ver "Red" abajo) ni en un dispositivo físico.

## Requisitos locales

| | |
|---|---|
| JDK | **17** (`/usr/libexec/java_home -v 17`); Gradle 9.x necesita ≥ 17 |
| Android SDK | `ANDROID_HOME=~/Library/Android/sdk` con platform 36, build-tools 36, NDK 27 |
| Node / pnpm | los del monorepo (`pnpm install` en la raíz) |

`android/` **no se versiona** (lo genera `expo prebuild`; está en `.gitignore`).
Toda personalización nativa va en `app.config.js` o en `plugins/`, nunca editando
`android/` a mano: el siguiente prebuild la borraría.

## Compilar

```bash
cd packages/mobile-app
pnpm exec expo prebuild --platform android --clean
cd android
export JAVA_HOME=$(/usr/libexec/java_home -v 17) ANDROID_HOME=$HOME/Library/Android/sdk
echo "sdk.dir=$ANDROID_HOME" > local.properties

./gradlew assembleDebug      # ~2.5 min  → app/build/outputs/apk/debug/
EXPO_PUBLIC_API_URL=https://… ./gradlew assembleRelease   # ~5.5 min, R8 activo
```

Para instalar y abrir: `adb install -r app/build/outputs/apk/release/app-release.apk`.

## Lo que hay que saber antes de publicar

1. **El APK release local está firmado con la llave de debug** (plantilla de
   Expo). Sirve para probar, **nunca para distribuir**. Las builds de
   distribución salen de EAS, que firma con sus credenciales gestionadas:
   `eas build -p android --profile production` (AAB, `versionCode` autoincremental
   en remoto) o `--profile preview` (APK interno).
2. **`EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_IM8_URL` se incrustan al compilar.**
   Defínelas como variables de entorno de EAS por perfil; el `.env` local apunta a
   `127.0.0.1` y no sirve para una build de distribución.
3. **Red:** una build release rechaza HTTP en claro (Android ≥ 9). Solo HTTPS en
   producción; para probar contra un backend local usa la build *debug* (permite
   HTTP) y `adb reverse tcp:8001 tcp:8001` con `EXPO_PUBLIC_API_URL=http://localhost:8001`.
4. **Push (permiso, FCM y EAS):** la app ya **pide el permiso** de notificaciones,
   siempre tras un toque del usuario: un paso nuevo al final del onboarding
   (explicación + "Activar avisos" / "Ahora no") y una tarjeta "Avisos" en Perfil
   para quien lo omitió o lo rechazó (si el SO ya no puede preguntar, lleva a los
   ajustes del teléfono). En Android 13+ el canal de notificaciones se crea *antes*
   de pedir el permiso; sin canal el SO no muestra el diálogo. Verificado en
   emulador API 36: diálogo del sistema, rechazo, reintento desde Perfil y
   concesión. Para que el token llegue al servidor faltan dos cosas de cuenta:
   - El proyecto de EAS ya existe (`@mike77790/apice-core`); su id está en
     `app.config.js` (`EAS_PROJECT_ID` lo sobrescribe) y el `slug` debe coincidir.
     Ejecuta `eas` siempre desde `packages/mobile-app/`: desde la raíz crea un
     `app.json` suelto.
   - FCM: `google-services.json` (paquete `com.apice.mobile`, proyecto Firebase
     `apice-cd659`) vive en `packages/mobile-app/` y está en `.gitignore`. Para
     EAS súbelo como variable de tipo archivo (ver comentario en `app.config.js`).
     Además, sube la clave de cuenta de servicio de FCM con `eas credentials`.
   Con la app abierta, las notificaciones se muestran como banner
   (`configureForegroundNotifications`, llamado al arrancar en `App.tsx`; sin
   sonido ni badge).
5. **Tamaño:** el APK universal pesa ~98 MB (4 ABIs). El AAB de Play entrega solo
   la ABI del dispositivo; para un APK de reparto directo, limita
   `reactNativeArchitectures` en `android/gradle.properties` (vía
   `expo-build-properties`) a `arm64-v8a`.

## Endurecimiento aplicado (`app.config.js`)

- `allowBackup: false`: los tokens de sesión viven en el almacenamiento de la app;
  no deben copiarse a Google Drive ni a otro dispositivo.
- `blockedPermissions`: `SYSTEM_ALERT_WINDOW` (solo el overlay de desarrollo; los
  builds debug lo vuelven a añadir), `READ/WRITE_EXTERNAL_STORAGE` (los
  certificados se escriben en almacenamiento de la app y se comparten con
  `expo-sharing`). Verificado en el APK final con `aapt2 dump permissions`.
