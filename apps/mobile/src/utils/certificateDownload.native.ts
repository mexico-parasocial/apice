import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

export interface DownloadCertificateOptions {
  url: string;
  accessToken: string;
  fileName: string;
}

/**
 * Native implementation (iOS/Android): downloads the certificate SVG with the
 * auth header and opens the system share sheet so the learner can save or
 * share it. Web fallback lives in ./certificateDownload.ts (platform split,
 * Bluesky pattern).
 */
export async function downloadCertificate({
  url,
  accessToken,
  fileName,
}: DownloadCertificateOptions): Promise<void> {
  const target = `${FileSystem.cacheDirectory}${fileName}`;

  const result = await FileSystem.downloadAsync(url, target, {
    headers: { "access-token": accessToken },
  });

  if (result.status !== 200) {
    throw new Error(`Descarga falló (${result.status})`);
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.uri, {
      mimeType: "image/svg+xml",
      dialogTitle: "Guardar certificado",
    });
  }
}
