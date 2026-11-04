import { Linking } from "react-native";

export interface DownloadCertificateOptions {
  url: string;
  accessToken: string;
  fileName: string;
}

/**
 * Web fallback: opens the download URL in the browser (the server sets
 * Content-Disposition: attachment). Native implementation lives in
 * ./certificateDownload.native.ts (platform split, Bluesky pattern).
 */
export async function downloadCertificate({
  url,
}: DownloadCertificateOptions): Promise<void> {
  await Linking.openURL(url);
}
